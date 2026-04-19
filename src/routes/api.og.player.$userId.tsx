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

interface OgData {
  name: string;
  currentElo: number | null;
  bestPosition: number | null;
  avatarUrl: string | null;
  form: FormState;
}

async function getPlayerOgData(userId: string): Promise<OgData | null> {
  const sb = getSupabaseAdmin();
  const { data: profile } = await sb
    .from("user_profiles")
    .select("name, nickname, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return null;

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

  // Form: compare last rating event vs avg of preceding 3 across all groups
  let form: FormState = "stable";
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

  return {
    name: profile.nickname?.trim() || profile.name || "Jogador",
    currentElo,
    bestPosition,
    avatarUrl: profile.avatar_url || null,
    form,
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

function formBadgeMarkup(form: FormState): { label: string; bg: string; fg: string } {
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
}): string {
  const name = escapeXml(truncate(opts.name, 24));
  const elo = opts.elo != null ? String(opts.elo) : "—";
  const bestPos = opts.bestPos != null ? `#${opts.bestPos}` : "—";
  const badge = formBadgeMarkup(opts.form);
  const badgeLabel = escapeXml(badge.label);

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
      // @ts-expect-error — vite supports ?url import for wasm
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
          const data = (await getPlayerOgData(params.userId)) || {
            name: "Jogador",
            currentElo: null,
            bestPosition: null,
            avatarUrl: null,
            form: "stable" as FormState,
          };

          const avatarDataUri = await fetchAvatarDataUri(data.avatarUrl);
          const svg = buildSvg({
            name: data.name,
            elo: data.currentElo,
            bestPos: data.bestPosition,
            avatarDataUri,
            form: data.form,
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
            return new Response(png, {
              status: 200,
              headers: { "Content-Type": "image/png", ...cacheHeaders },
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
