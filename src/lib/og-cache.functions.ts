/**
 * Server functions for OG cache management.
 *
 * - invalidateOwnOgCache: deletes all cached OG PNGs for the calling user.
 *   Used when user updates avatar/name and wants the share card refreshed.
 * - getOgCacheStats: returns hit/miss counts (last 7 days) + top players.
 *   Visible only to group creators.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const invalidateOwnOgCache = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId as string;
    try {
      const { data: list } = await supabaseAdmin.storage
        .from("og-cache")
        .list("og", { limit: 100, search: userId });
      const targets = (list || [])
        .filter((f) => f.name.startsWith(`${userId}_`))
        .map((f) => `og/${f.name}`);
      if (targets.length > 0) {
        await supabaseAdmin.storage.from("og-cache").remove(targets);
      }
      return { deleted: targets.length, error: null as string | null };
    } catch (e) {
      console.error("invalidateOwnOgCache failed:", e);
      return { deleted: 0, error: "Falha ao limpar o cache" };
    }
  });

export interface OgCacheStats {
  totalHit: number;
  totalMiss: number;
  hitRatePct: number; // 0..100
  topPlayers: { user_id: string; name: string; renders: number }[];
  daily: { date: string; hit: number; miss: number }[];
  windowDays: number;
}

export const getOgCacheStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OgCacheStats> => {
    const userId = context.userId as string;

    // Authorization: must be a creator of at least one group
    const { data: creatorMemberships } = await supabaseAdmin
      .from("group_members")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "creator")
      .eq("status", "active")
      .limit(1);
    if (!creatorMemberships || creatorMemberships.length === 0) {
      throw new Error("Forbidden: not a group creator");
    }

    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: events } = await supabaseAdmin
      .from("og_render_events")
      .select("user_id, status")
      .gte("created_at", since)
      .limit(50_000);

    let hit = 0;
    let miss = 0;
    const perPlayer = new Map<string, number>();
    for (const e of events || []) {
      if (e.status === "HIT") hit++;
      else if (e.status === "MISS") miss++;
      perPlayer.set(e.user_id, (perPlayer.get(e.user_id) || 0) + 1);
    }
    const total = hit + miss;
    const topIds = Array.from(perPlayer.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    let topPlayers: OgCacheStats["topPlayers"] = [];
    if (topIds.length > 0) {
      const ids = topIds.map(([id]) => id);
      const { data: profiles } = await supabaseAdmin
        .from("user_profiles")
        .select("user_id, name, nickname")
        .in("user_id", ids);
      const nameById = new Map<string, string>();
      for (const p of profiles || []) {
        nameById.set(p.user_id, p.nickname?.trim() || p.name || "Jogador");
      }
      topPlayers = topIds.map(([id, count]) => ({
        user_id: id,
        name: nameById.get(id) || "Jogador",
        renders: count,
      }));
    }

    return {
      totalHit: hit,
      totalMiss: miss,
      hitRatePct: total > 0 ? Math.round((hit / total) * 100) : 0,
      topPlayers,
      windowDays: 7,
    };
  });
