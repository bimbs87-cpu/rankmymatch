/**
 * Dynamic Open Graph image for /players/$userId.
 *
 * Returns an SVG (image/svg+xml) rendered with the player's name, current Elo
 * (best across groups) and best position ever achieved.
 *
 * SVG is used instead of PNG because the Cloudflare Worker SSR runtime cannot
 * run native image libs (sharp/canvas). Discord, Twitter and most modern
 * scrapers render SVG og:images fine; WhatsApp may fall back to a default.
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

async function getPlayerOgData(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("name, nickname")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return null;

  // Latest Elo per season — pick max
  const { data: snapshots } = await supabaseAdmin
    .from("ranking_snapshots")
    .select("rating, position, season_id, snapshot_date")
    .eq("user_id", userId)
    .order("snapshot_date", { ascending: false })
    .limit(50);

  let currentElo: number | null = null;
  let bestPosition: number | null = null;

  if (snapshots && snapshots.length > 0) {
    // Latest per season
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

  return {
    name: profile.nickname?.trim() || profile.name || "Jogador",
    currentElo,
    bestPosition,
  };
}

function buildSvg(opts: { name: string; elo: number | null; bestPos: number | null }): string {
  const name = escapeXml(truncate(opts.name, 28));
  const elo = opts.elo != null ? String(opts.elo) : "—";
  const bestPos = opts.bestPos != null ? `#${opts.bestPos}` : "—";

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
    <text x="80" y="120" font-size="32" font-weight="600" fill="#a3ff12" letter-spacing="4">RANKMYMATCH</text>
    <text x="80" y="240" font-size="84" font-weight="800" fill="#ffffff">${name}</text>
    <text x="80" y="290" font-size="28" font-weight="500" fill="#9ca3af">Perfil competitivo de padel</text>

    <g transform="translate(80, 380)">
      <rect width="480" height="180" rx="24" fill="#1a201f" stroke="#2a312f" stroke-width="2"/>
      <text x="32" y="56" font-size="20" font-weight="700" fill="#9ca3af" letter-spacing="2">ELO ATUAL</text>
      <text x="32" y="140" font-size="96" font-weight="800" fill="url(#accent)" font-variant-numeric="tabular-nums">${elo}</text>
    </g>

    <g transform="translate(600, 380)">
      <rect width="520" height="180" rx="24" fill="#1a201f" stroke="#2a312f" stroke-width="2"/>
      <text x="32" y="56" font-size="20" font-weight="700" fill="#9ca3af" letter-spacing="2">MELHOR POSIÇÃO</text>
      <text x="32" y="140" font-size="96" font-weight="800" fill="#ffffff" font-variant-numeric="tabular-nums">${bestPos}</text>
    </g>
  </g>
</svg>`;
}

function buildFallbackSvg(): string {
  return buildSvg({ name: "Jogador", elo: null, bestPos: null });
}

export const Route = createFileRoute("/api/og/player/$userId")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ params }) => {
        const headers = {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=300, s-maxage=600",
          ...CORS_HEADERS,
        };

        try {
          const data = await getPlayerOgData(params.userId);
          if (!data) {
            return new Response(buildFallbackSvg(), { status: 200, headers });
          }
          const svg = buildSvg({
            name: data.name,
            elo: data.currentElo,
            bestPos: data.bestPosition,
          });
          return new Response(svg, { status: 200, headers });
        } catch (err) {
          console.error("og/player error:", err);
          return new Response(buildFallbackSvg(), { status: 200, headers });
        }
      },
    },
  },
});
