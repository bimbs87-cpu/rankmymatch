/**
 * Dynamic Open Graph image for /players/$userId.
 *
 * Renders a 1200x630 card with the player's avatar, name, current Elo, best
 * position and form trend (EM ALTA / EM QUEDA / ESTÁVEL).
 *
 * Tries PNG via @resvg/resvg-wasm for maximum compatibility (WhatsApp,
 * iMessage). Falls back to SVG if the WASM runtime cannot initialize in this
 * Worker environment.
 *
 * Query params:
 *   ?format=svg  → force SVG response
 *   ?format=png  → force PNG (will 500 if rasterizer unavailable)
 *   (default)    → try PNG, fall back to SVG transparently
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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

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

type FormState = "rising" | "falling" | "stable";

type AccentColor = "emerald" | "amber" | "sky" | "rose" | "violet" | "slate";
const ACCENT_PALETTE: Record<AccentColor, { bg: string; fg: string }> = {
  emerald: { bg: "#a3ff12", fg: "#0a0e0d" },
  amber: { bg: "#fbbf24", fg: "#0a0e0d" },
  sky: { bg: "#38bdf8", fg: "#0a0e0d" },
  rose: { bg: "#fb7185", fg: "#0a0e0d" },
  violet: { bg: "#a78bfa", fg: "#0a0e0d" },
  slate: { bg: "#94a3b8", fg: "#0a0e0d" },
};

interface OgData {
  name: string;
  currentElo: number | null;
  bestPosition: number | null;
  avatarUrl: string | null;
  form: FormState;
  tagline: string | null;
  accentColor: AccentColor | null;
}

async function getPlayerOgData(
  userId: string,
  overrides?: { tagline?: string | null; accentColor?: AccentColor | null },
): Promise<{ data: OgData | null; cacheKey: string }> {
  const sb = getSupabaseAdmin();
  const { data: profile } = await sb
    .from("user_profiles")
    .select("name, nickname, avatar_url, share_tagline, share_accent_color")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return { data: null, cacheKey: "no-profile" };

  const { data: snapshots } = await sb
    .from("ranking_snapshots")
    .select("rating, position, season_id, snapshot_date")
    .eq("user_id", userId)
    .order("snapshot_date", { ascending: false })
    .limit(50);

  let currentElo: number | null = null;
  let bestPosition: number | null = null;

  if (snapshots && snapshots.length > 0) {
    const latestPerSeason = new Map<string, { rating: number; position: number | null }>();
    for (const s of snapshots) {
      if (!latestPerSeason.has(s.season_id)) {
        latestPerSeason.set(s.season_id, { rating: Number(s.rating), position: s.position });
      }
    }
    const ratings = Array.from(latestPerSeason.values()).map((v) => v.rating);
    if (ratings.length) currentElo = Math.round(Math.max(...ratings));

    const positions = snapshots
      .map((s) => s.position)
      .filter((p): p is number => p != null && p > 0);
    if (positions.length) bestPosition = Math.min(...positions);
  }

  // Form + cache key derived from last rating event timestamp
  let form: FormState = "stable";
  let lastEventTs = "init";
  const { data: events } = await sb
    .from("rating_events")
    .select("rating_change, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (events && events.length >= 2) {
    const sumChange = events.slice(0, 5).reduce((acc, e) => acc + Number(e.rating_change || 0), 0);
    if (sumChange > 8) form = "rising";
    else if (sumChange < -8) form = "falling";
  }
  if (events && events.length > 0) {
    lastEventTs = String(new Date(events[0].created_at).getTime());
  }

  const rawTagline = overrides && "tagline" in overrides ? overrides.tagline : profile.share_tagline;
  const tagline = (rawTagline || "").trim() || null;
  const taglineHash = tagline
    ? Array.from(tagline).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(36)
    : "n";

  const rawAccent =
    overrides && "accentColor" in overrides ? overrides.accentColor : (profile.share_accent_color as AccentColor | null);
  const accentColor: AccentColor | null =
    rawAccent && rawAccent in ACCENT_PALETTE ? (rawAccent as AccentColor) : null;
  const accentKey = accentColor || "n";

  return {
    data: {
      name: profile.nickname?.trim() || profile.name || "Jogador",
      currentElo,
      bestPosition,
      avatarUrl: profile.avatar_url || null,
      form,
      tagline,
      accentColor,
    },
    cacheKey: `${lastEventTs}_${taglineHash}_${accentKey}`,
  };
}

/**
 * Fetches an avatar URL and returns a data URI (base64) suitable for embedding
 * in <image href="..."/>. Returns null on any failure (network, large size,
 * unsupported scheme like avatar:padel-01). Caps at ~300KB.
 */
async function fetchAvatarDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  // Skip avatar: scheme markers (preset avatars from Vite glob — not URLs)
  if (url.startsWith("avatar:") || url.startsWith("emoji:")) return null;
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
    if (buf.byteLength > 300_000) return null;
    // Base64 encode
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

function formBadgeMarkup(
  form: FormState,
  accent: AccentColor | null,
): { label: string; bg: string; fg: string } {
  if (accent) {
    const palette = ACCENT_PALETTE[accent];
    const label =
      form === "rising" ? "▲  EM ALTA" : form === "falling" ? "▼  EM QUEDA" : "•  ESTÁVEL";
    return { label, bg: palette.bg, fg: palette.fg };
  }
  if (form === "rising") return { label: "▲  EM ALTA", bg: "#a3ff12", fg: "#0a0e0d" };
  if (form === "falling") return { label: "▼  EM QUEDA", bg: "#ff5570", fg: "#0a0e0d" };
  return { label: "•  ESTÁVEL", bg: "#3a4140", fg: "#e5e7eb" };
}

function buildSvg(opts: {
  name: string;
  elo: number | null;
  bestPos: number | null;
  avatarDataUri: string | null;
  form: FormState;
  tagline: string | null;
  accentColor: AccentColor | null;
}): string {
  const name = escapeXml(truncate(opts.name, 24));
  const elo = opts.elo != null ? String(opts.elo) : "—";
  const bestPos = opts.bestPos != null ? `#${opts.bestPos}` : "—";
  const badge = formBadgeMarkup(opts.form, opts.accentColor);
  const badgeLabel = escapeXml(badge.label);
  const tagline = opts.tagline ? escapeXml(truncate(opts.tagline, 60)) : null;

  const avatarBlock = opts.avatarDataUri
    ? `<g transform="translate(80, 200)">
        <defs>
          <clipPath id="avatarClip"><circle cx="90" cy="90" r="90"/></clipPath>
        </defs>
        <circle cx="90" cy="90" r="94" fill="#1a201f" stroke="#a3ff12" stroke-width="3"/>
        <image href="${opts.avatarDataUri}" x="0" y="0" width="180" height="180" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>
      </g>`
    : `<g transform="translate(80, 200)">
        <circle cx="90" cy="90" r="94" fill="#1a201f" stroke="#2a312f" stroke-width="3"/>
        <text x="90" y="118" font-size="80" font-weight="800" fill="#a3ff12" text-anchor="middle" font-family="Inter, sans-serif">${escapeXml((opts.name[0] || "?").toUpperCase())}</text>
      </g>`;

  // Text starts to the right of the avatar (x=300)
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
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g font-family="Inter, system-ui, -apple-system, Segoe UI, sans-serif">
    <text x="80" y="110" font-size="32" font-weight="600" fill="#a3ff12" letter-spacing="4">RANKMYMATCH</text>
    <text x="80" y="155" font-size="22" font-weight="500" fill="#9ca3af">Perfil competitivo de padel</text>

    ${avatarBlock}

    <text x="300" y="260" font-size="64" font-weight="800" fill="#ffffff">${name}</text>

    <g transform="translate(300, 295)">
      <rect width="${badgeLabel.length * 16 + 60}" height="44" rx="22" fill="${badge.bg}"/>
      <text x="30" y="29" font-size="20" font-weight="800" fill="${badge.fg}" letter-spacing="2">${badgeLabel}</text>
    </g>
    ${
      tagline
        ? `<text x="300" y="385" font-size="26" font-style="italic" font-weight="500" fill="#cbd5e1">"${tagline}"</text>`
        : ""
    }

    <g transform="translate(80, 430)">
      <rect width="500" height="150" rx="24" fill="#1a201f" stroke="#2a312f" stroke-width="2"/>
      <text x="32" y="50" font-size="18" font-weight="700" fill="#9ca3af" letter-spacing="2">ELO ATUAL</text>
      <text x="32" y="125" font-size="80" font-weight="800" fill="url(#accent)" font-variant-numeric="tabular-nums">${elo}</text>
    </g>

    <g transform="translate(620, 430)">
      <rect width="500" height="150" rx="24" fill="#1a201f" stroke="#2a312f" stroke-width="2"/>
      <text x="32" y="50" font-size="18" font-weight="700" fill="#9ca3af" letter-spacing="2">MELHOR POSIÇÃO</text>
      <text x="32" y="125" font-size="80" font-weight="800" fill="#ffffff" font-variant-numeric="tabular-nums">${bestPos}</text>
    </g>
  </g>
</svg>`;
}

function buildFallbackSvg(): string {
  return buildSvg({
    name: "Jogador",
    elo: null,
    bestPos: null,
    avatarDataUri: null,
    form: "stable",
    tagline: null,
    accentColor: null,
  });
}

/**
 * Lazily load and initialize @resvg/resvg-wasm. Returns null if the runtime
 * cannot initialize (any error), so we can fall back to SVG.
 *
 * Cached so subsequent requests skip init.
 */
let resvgInitPromise: Promise<typeof import("@resvg/resvg-wasm") | null> | null = null;
async function getResvg(): Promise<typeof import("@resvg/resvg-wasm") | null> {
  if (resvgInitPromise) return resvgInitPromise;
  resvgInitPromise = (async () => {
    try {
      const mod = await import("@resvg/resvg-wasm");
      // Fetch wasm asset and initialize. The .wasm file is shipped with the
      // package; resolve via dynamic import URL on supported runtimes.
      // @ts-ignore — vite supports ?url import for wasm
      const wasmUrl = (await import("@resvg/resvg-wasm/index_bg.wasm?url")).default as string;
      const wasmRes = await fetch(wasmUrl);
      if (!wasmRes.ok) throw new Error("wasm fetch failed");
      const wasmBuf = await wasmRes.arrayBuffer();
      await mod.initWasm(wasmBuf);
      return mod;
    } catch (e) {
      console.error("resvg init failed, falling back to SVG:", e);
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
    const png = r.render().asPng();
    return png;
  } catch (e) {
    console.error("resvg render failed:", e);
    return null;
  }
}

export const Route = createFileRoute("/api/og/player/$userId")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),
      // Lightweight cache probe — used by the share dialog to display
      // a "PNG cache HIT/MISS" badge without re-rendering the image.
      HEAD: async ({ params }) => {
        try {
          const fetched = await getPlayerOgData(params.userId);
          const cacheKey = fetched.cacheKey;
          const cacheObjectPath = `og/${params.userId}_${cacheKey}.png`;
          const sb = getSupabaseAdmin();
          const { data: existing } = await sb.storage
            .from("og-cache")
            .download(cacheObjectPath);
          return new Response(null, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "X-Cache": existing ? "HIT" : "MISS",
              ...CORS_HEADERS,
            },
          });
        } catch {
          return new Response(null, {
            status: 200,
            headers: { "X-Cache": "MISS", ...CORS_HEADERS },
          });
        }
      },
      // Owner-only: deletes the cached PNG so the next render is fresh.
      // Useful right after avatar/profile changes.
      DELETE: async ({ params, request }) => {
        try {
          const auth = request.headers.get("authorization") || "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
          if (!token) {
            return new Response(JSON.stringify({ error: "Missing auth" }), {
              status: 401,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            });
          }
          // Validate token with admin client
          const sb = getSupabaseAdmin();
          const { data: userResp } = await sb.auth.getUser(token);
          if (!userResp?.user || userResp.user.id !== params.userId) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
              status: 403,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            });
          }
          // List and delete all cached files for this user
          const { data: list } = await sb.storage
            .from("og-cache")
            .list("og", { limit: 100, search: params.userId });
          const targets = (list || [])
            .filter((f) => f.name.startsWith(`${params.userId}_`))
            .map((f) => `og/${f.name}`);
          if (targets.length > 0) {
            await sb.storage.from("og-cache").remove(targets);
          }
          return new Response(JSON.stringify({ deleted: targets.length }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        } catch (e) {
          console.error("og DELETE error:", e);
          return new Response(JSON.stringify({ error: "Internal" }), {
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

        // Live-preview overrides (skip cache when present)
        const previewTagline = reqUrl.searchParams.get("tagline");
        const previewAccentRaw = reqUrl.searchParams.get("accent");
        const validAccents: AccentColor[] = ["emerald", "amber", "sky", "rose", "violet", "slate"];
        const previewAccent = validAccents.includes(previewAccentRaw as AccentColor)
          ? (previewAccentRaw as AccentColor)
          : null;
        const hasPreview = previewTagline !== null || previewAccentRaw !== null;

        const cacheHeaders = {
          "Cache-Control": hasPreview
            ? "no-store"
            : "public, max-age=300, s-maxage=600",
          ...CORS_HEADERS,
        };

        const logRender = (status: "HIT" | "MISS") => {
          try {
            const sb = getSupabaseAdmin();
            void sb.from("og_render_events").insert({ user_id: params.userId, status });
          } catch {
            // ignore
          }
        };

        try {
          const overrides = hasPreview
            ? {
                tagline: previewTagline !== null ? previewTagline : undefined,
                accentColor: previewAccentRaw !== null ? previewAccent : undefined,
              }
            : undefined;
          const fetched = await getPlayerOgData(params.userId, overrides);
          const data = fetched.data || {
            name: "Jogador",
            currentElo: null,
            bestPosition: null,
            avatarUrl: null,
            form: "stable" as FormState,
            tagline: null,
            accentColor: null,
          };
          const cacheKey = fetched.cacheKey;

          // Try Storage cache first (only for default PNG flow). 6h TTL.
          // Cache key format: og/{userId}_{lastEventTs}_{taglineHash}.png — changes
          // when player plays a new match OR updates their share tagline.
          const wantsCachedPng = !wantSvg && !hasPreview;
          const cacheObjectPath = `og/${params.userId}_${cacheKey}.png`;
          if (wantsCachedPng) {
            try {
              const sb = getSupabaseAdmin();
              const { data: existing } = await sb.storage
                .from("og-cache")
                .download(cacheObjectPath);
              if (existing) {
                const buf = await existing.arrayBuffer();
                logRender("HIT");
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

          const avatarDataUri = await fetchAvatarDataUri(data.avatarUrl);
          const svg = buildSvg({
            name: data.name,
            elo: data.currentElo,
            bestPos: data.bestPosition,
            avatarDataUri,
            form: data.form,
            tagline: data.tagline,
            accentColor: data.accentColor,
          });

          if (wantSvg) {
            return new Response(svg, {
              status: 200,
              headers: { "Content-Type": "image/svg+xml; charset=utf-8", ...cacheHeaders },
            });
          }

          // Default: try PNG, fall back to SVG (unless caller forced PNG).
          const png = await svgToPng(svg);
          if (png) {
            // Fire-and-forget cache write (don't block response). 6h TTL.
            try {
              const sb = getSupabaseAdmin();
              await sb.storage.from("og-cache").upload(cacheObjectPath, png as unknown as Blob, {
                contentType: "image/png",
                upsert: true,
                cacheControl: "21600",
              });
            } catch (e) {
              console.error("og cache write failed:", e);
            }
            logRender("MISS");
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
          console.error("og/player error:", err);
          return new Response(buildFallbackSvg(), {
            status: 200,
            headers: { "Content-Type": "image/svg+xml; charset=utf-8", ...cacheHeaders },
          });
        }
      },
    },
  },
});
