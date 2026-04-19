import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SITE = "https://rankmymatch.app";

const STATIC_ROUTES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/landing", changefreq: "weekly", priority: "0.9" },
  { path: "/sistema", changefreq: "monthly", priority: "0.8" },
  { path: "/comparar", changefreq: "weekly", priority: "0.7" },
  { path: "/ranking-info", changefreq: "monthly", priority: "0.6" },
  { path: "/login", changefreq: "yearly", priority: "0.3" },
];

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls: string[] = [];
        const now = new Date().toISOString();

        for (const r of STATIC_ROUTES) {
          urls.push(
            `<url><loc>${SITE}${r.path}</loc><lastmod>${now}</lastmod><changefreq>${r.changefreq}</changefreq><priority>${r.priority}</priority></url>`,
          );
        }

        // Public groups
        try {
          const { data: groups } = await supabaseAdmin
            .from("groups")
            .select("id, updated_at, visibility, is_public")
            .or("visibility.eq.public,is_public.eq.true")
            .limit(1000);
          for (const g of groups ?? []) {
            const lastmod = (g.updated_at ?? now) as string;
            urls.push(
              `<url><loc>${SITE}/groups/${escapeXml(g.id)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
            );
          }
        } catch (err) {
          console.error("[sitemap] groups error", err);
        }

        // Indexable players (non-placeholder, public profile)
        try {
          const { data: players } = await supabaseAdmin
            .from("user_profiles")
            .select("user_id, updated_at, is_placeholder, privacy_settings")
            .eq("is_placeholder", false)
            .limit(2000);
          for (const p of players ?? []) {
            const privacy = (p.privacy_settings ?? {}) as Record<string, unknown>;
            // Skip if user explicitly hid public profile
            if (privacy.public_profile === false) continue;
            const lastmod = (p.updated_at ?? now) as string;
            urls.push(
              `<url><loc>${SITE}/players/${escapeXml(p.user_id)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`,
            );
          }
        } catch (err) {
          console.error("[sitemap] players error", err);
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
          },
        });
      },
    },
  },
});
