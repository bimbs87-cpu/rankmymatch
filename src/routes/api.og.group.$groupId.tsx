/**
 * Dynamic Open Graph image for /groups/$groupId.
 *
 * Renders a 1200x630 card with the group's logo, name, member count and
 * active season name (if any). Mirrors the player OG route — tries PNG via
 * @resvg/resvg-wasm with SVG fallback, and caches PNGs in the og-cache
 * Storage bucket keyed by group updated_at + active season id.
 *
 * Query params:
 *   ?format=svg → force SVG response
 *   ?format=png → force PNG (500 if rasterizer unavailable)
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server env");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

/**
 * Deletes all cached PNGs for a given group from the og-cache bucket.
 * Returns the number of removed files. Safe to call repeatedly.
 */
async function clearGroupOgCache(groupId: string): Promise<number> {
  const sb = getSupabaseAdmin();
  const { data: list } = await sb.storage
    .from("og-cache")
    .list("og-group", { limit: 100, search: groupId });
  const targets = (list || [])
    .filter((f) => f.name.startsWith(`${groupId}_`))
    .map((f) => `og-group/${f.name}`);
  if (targets.length === 0) return 0;
  await sb.storage.from("og-cache").remove(targets);
  return targets.length;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

interface GroupOgData {
  name: string;
  logoUrl: string | null;
  ogCoverUrl: string | null;
  memberCount: number;
  activeSeasonName: string | null;
  sport: string;
  mode: string;
  cacheKey: string;
}

async function getGroupOgData(groupId: string): Promise<GroupOgData | null> {
  const sb = getSupabaseAdmin();
  const { data: group } = await sb
    .from("groups")
    .select("id, name, image_url, og_cover_url, sport, mode, updated_at")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return null;

  // Member count (exclude removed)
  const { count: memberCount } = await sb
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .neq("status", "removed");

  // Active season
  const { data: season } = await sb
    .from("seasons")
    .select("id, name, updated_at")
    .eq("group_id", groupId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ogCoverUrl = (group as { og_cover_url?: string | null }).og_cover_url ?? null;

  const cacheKey = [
    String(new Date(group.updated_at).getTime()),
    String(memberCount ?? 0),
    season?.id || "no-season",
    season ? String(new Date(season.updated_at).getTime()) : "0",
    ogCoverUrl ? "cov1" : "cov0",
  ].join("_");

  return {
    name: group.name,
    logoUrl: group.image_url,
    ogCoverUrl,
    memberCount: memberCount ?? 0,
    activeSeasonName: season?.name ?? null,
    sport: group.sport,
    mode: group.mode,
    cacheKey,
  };
}

async function fetchImageDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RankMyMatch-OG/1.0" },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 400_000) return null;
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

const SPORT_LABEL: Record<string, string> = {
  padel: "Padel",
  beach_tennis: "Beach Tennis",
  tennis: "Tennis",
};

function buildSvg(opts: {
  name: string;
  logoDataUri: string | null;
  coverDataUri: string | null;
  memberCount: number;
  activeSeasonName: string | null;
  sport: string;
}): string {
  const name = escapeXml(truncate(opts.name, 26));
  const sportLabel = escapeXml(SPORT_LABEL[opts.sport] || "Padel");
  const memberLabel = `${opts.memberCount} ${opts.memberCount === 1 ? "membro" : "membros"}`;
  const seasonLabel = opts.activeSeasonName
    ? escapeXml(truncate(opts.activeSeasonName, 30))
    : null;

  const logoBlock = opts.logoDataUri
    ? `<g transform="translate(80, 200)">
        <defs>
          <clipPath id="logoClip"><rect x="0" y="0" width="220" height="220" rx="32"/></clipPath>
        </defs>
        <rect x="-4" y="-4" width="228" height="228" rx="36" fill="#1a201f" stroke="#a3ff12" stroke-width="3"/>
        <image href="${opts.logoDataUri}" x="0" y="0" width="220" height="220" clip-path="url(#logoClip)" preserveAspectRatio="xMidYMid slice"/>
      </g>`
    : `<g transform="translate(80, 200)">
        <rect x="-4" y="-4" width="228" height="228" rx="36" fill="#1a201f" stroke="#2a312f" stroke-width="3"/>
        <text x="110" y="148" font-size="100" font-weight="800" fill="#a3ff12" text-anchor="middle" font-family="Inter, sans-serif">${escapeXml((opts.name[0] || "?").toUpperCase())}</text>
      </g>`;

  // When a custom OG cover is provided, render it as a darkened hero background
  // behind the brand-dark gradient so text remains legible.
  const coverBlock = opts.coverDataUri
    ? `<image href="${opts.coverDataUri}" x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice" opacity="0.55"/>
       <rect width="1200" height="630" fill="url(#coverShade)"/>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0e0d"/>
      <stop offset="100%" stop-color="#161b1a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#a3ff12"/>
      <stop offset="100%" stop-color="#7adb00"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.15" r="0.6">
      <stop offset="0%" stop-color="#a3ff12" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#a3ff12" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="coverShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0e0d" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#0a0e0d" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  ${coverBlock}
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g font-family="Inter, system-ui, -apple-system, Segoe UI, sans-serif">
    <text x="80" y="110" font-size="32" font-weight="600" fill="#a3ff12" letter-spacing="4">RANKMYMATCH</text>
    <text x="80" y="155" font-size="22" font-weight="500" fill="#9ca3af">Grupo · ${sportLabel}</text>

    ${logoBlock}

    <text x="340" y="260" font-size="64" font-weight="800" fill="#ffffff">${name}</text>

    <g transform="translate(340, 295)">
      <rect width="240" height="44" rx="22" fill="#a3ff12"/>
      <text x="120" y="29" font-size="20" font-weight="800" fill="#0a0e0d" text-anchor="middle" letter-spacing="1">${escapeXml(memberLabel.toUpperCase())}</text>
    </g>

    ${
      seasonLabel
        ? `<g transform="translate(340, 360)">
            <text x="0" y="22" font-size="18" font-weight="700" fill="#9ca3af" letter-spacing="2">TEMPORADA ATIVA</text>
            <text x="0" y="60" font-size="32" font-weight="700" fill="#ffffff">${seasonLabel}</text>
          </g>`
        : `<g transform="translate(340, 360)">
            <text x="0" y="22" font-size="18" font-weight="700" fill="#9ca3af" letter-spacing="2">SEM TEMPORADA ATIVA</text>
            <text x="0" y="60" font-size="22" font-weight="500" fill="#cbd5e1">Aguardando próxima temporada</text>
          </g>`
    }

    <g transform="translate(80, 510)">
      <rect width="1040" height="60" rx="18" fill="#1a201f" stroke="#2a312f" stroke-width="2"/>
      <text x="32" y="38" font-size="18" font-weight="600" fill="#cbd5e1">
        Acompanhe ranking, temporadas e rivalidades em tempo real
      </text>
      <text x="1008" y="38" font-size="20" font-weight="800" fill="url(#accent)" text-anchor="end" letter-spacing="3">RANKMYMATCH.APP</text>
    </g>
  </g>
</svg>`;
}

function buildFallbackSvg(): string {
  return buildSvg({
    name: "Grupo",
    logoDataUri: null,
    coverDataUri: null,
    memberCount: 0,
    activeSeasonName: null,
    sport: "padel",
  });
}

let resvgInitPromise: Promise<typeof import("@resvg/resvg-wasm") | null> | null = null;
async function getResvg(): Promise<typeof import("@resvg/resvg-wasm") | null> {
  if (resvgInitPromise) return resvgInitPromise;
  resvgInitPromise = (async () => {
    try {
      const mod = await import("@resvg/resvg-wasm");
      // @ts-ignore — vite supports ?url for wasm
      const wasmUrl = (await import("@resvg/resvg-wasm/index_bg.wasm?url")).default as string;
      const wasmRes = await fetch(wasmUrl);
      if (!wasmRes.ok) throw new Error("wasm fetch failed");
      const wasmBuf = await wasmRes.arrayBuffer();
      await mod.initWasm(wasmBuf);
      return mod;
    } catch (e) {
      console.error("resvg init failed (group), falling back to SVG:", e);
      return null;
    }
  })();
  return resvgInitPromise;
}

async function svgToPng(svg: string): Promise<Uint8Array | null> {
  const resvg = await getResvg();
  if (!resvg) return null;
  try {
    const r = new resvg.Resvg(svg, {
      fitTo: { mode: "width", value: 1200 },
      font: { loadSystemFonts: false },
    });
    return r.render().asPng();
  } catch (e) {
    console.error("resvg group render failed:", e);
    return null;
  }
}

export const Route = createFileRoute("/api/og/group/$groupId")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      DELETE: async ({ params, request }) => {
        // Auth: caller must be a group admin. We re-validate using the user's JWT
        // (NOT service role) by reading the Authorization header.
        try {
          const authHeader = request.headers.get("Authorization") || "";
          const token = authHeader.replace(/^Bearer\s+/i, "");
          if (!token) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            });
          }
          const sb = getSupabaseAdmin();
          const { data: userRes } = await sb.auth.getUser(token);
          const uid = userRes?.user?.id;
          if (!uid) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            });
          }
          const { data: isAdmin } = await sb.rpc("is_group_admin", {
            _user_id: uid,
            _group_id: params.groupId,
          });
          if (!isAdmin) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
              status: 403,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            });
          }
          const deleted = await clearGroupOgCache(params.groupId);
          return new Response(JSON.stringify({ deleted }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        } catch (err) {
          console.error("og/group DELETE error:", err);
          return new Response(JSON.stringify({ error: "Internal error" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        }
      },
      GET: async ({ params, request }) => {
        const reqUrl = new URL(request.url);
        const formatParam = reqUrl.searchParams.get("format");
        const wantSvg = formatParam === "svg";
        const wantPngOnly = formatParam === "png";

        const cacheHeaders = {
          "Cache-Control": "public, max-age=300, s-maxage=600",
          ...CORS_HEADERS,
        };

        try {
          const data = await getGroupOgData(params.groupId);
          if (!data) {
            return new Response(buildFallbackSvg(), {
              status: 200,
              headers: { "Content-Type": "image/svg+xml; charset=utf-8", ...cacheHeaders },
            });
          }

          const wantsCachedPng = !wantSvg;
          const cacheObjectPath = `og-group/${params.groupId}_${data.cacheKey}.png`;
          if (wantsCachedPng) {
            try {
              const sb = getSupabaseAdmin();
              const { data: existing } = await sb.storage
                .from("og-cache")
                .download(cacheObjectPath);
              if (existing) {
                const buf = await existing.arrayBuffer();
                return new Response(buf, {
                  status: 200,
                  headers: {
                    "Content-Type": "image/png",
                    "Cache-Control": "public, max-age=21600, s-maxage=21600",
                    "X-Cache": "HIT",
                    ...CORS_HEADERS,
                  },
                });
              }
            } catch {
              // ignore — render fresh
            }
          }

          const logoDataUri = await fetchImageDataUri(data.logoUrl);
          const svg = buildSvg({
            name: data.name,
            logoDataUri,
            memberCount: data.memberCount,
            activeSeasonName: data.activeSeasonName,
            sport: data.sport,
          });

          if (wantSvg) {
            return new Response(svg, {
              status: 200,
              headers: { "Content-Type": "image/svg+xml; charset=utf-8", ...cacheHeaders },
            });
          }

          const png = await svgToPng(svg);
          if (png) {
            try {
              const sb = getSupabaseAdmin();
              await sb.storage.from("og-cache").upload(cacheObjectPath, png as unknown as Blob, {
                contentType: "image/png",
                upsert: true,
                cacheControl: "21600",
              });
            } catch (e) {
              console.error("og group cache write failed:", e);
            }
            return new Response(png as unknown as BodyInit, {
              status: 200,
              headers: {
                "Content-Type": "image/png",
                "Cache-Control": "public, max-age=21600, s-maxage=21600",
                "X-Cache": "MISS",
                ...CORS_HEADERS,
              },
            });
          }

          if (wantPngOnly) {
            return new Response("PNG rasterizer unavailable", {
              status: 503,
              headers: cacheHeaders,
            });
          }

          return new Response(svg, {
            status: 200,
            headers: { "Content-Type": "image/svg+xml; charset=utf-8", ...cacheHeaders },
          });
        } catch (err) {
          console.error("og/group error:", err);
          return new Response(buildFallbackSvg(), {
            status: 200,
            headers: { "Content-Type": "image/svg+xml; charset=utf-8", ...cacheHeaders },
          });
        }
      },
    },
  },
});
