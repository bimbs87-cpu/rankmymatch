import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * LGPD — Direito de Portabilidade.
 * Returns a JSON dump of all data the authenticated user has in the system:
 * profile, group memberships, matches played, ratings and stats.
 */
export const exportMyDataFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const [
      profileRes,
      membershipsRes,
      matchPlayersRes,
      ratingsRes,
      statsRes,
      presenceRes,
      notificationsRes,
      pushPrefsRes,
      compareRes,
      bugReportsRes,
      claimsRes,
      acquisitionRes,
    ] = await Promise.all([
      supabaseAdmin.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("group_members").select("group_id, role, status, joined_at").eq("user_id", userId),
      supabaseAdmin.from("match_players").select("match_id, team, created_at").eq("user_id", userId),
      supabaseAdmin
        .from("rating_events")
        .select("match_id, season_id, rating_before, rating_after, rating_change, created_at, match_format")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabaseAdmin.from("player_stats_by_season").select("*").eq("user_id", userId),
      supabaseAdmin.from("round_presence").select("round_id, status, confirmed_at, created_at").eq("user_id", userId),
      supabaseAdmin.from("notifications").select("type, title, body, data, read, created_at").eq("user_id", userId),
      supabaseAdmin.from("push_notification_preferences").select("event_type, enabled").eq("user_id", userId),
      supabaseAdmin.from("compare_favorites").select("group_id, label, player_ids, created_at").eq("user_id", userId),
      supabaseAdmin.from("bug_reports").select("title, description, status, created_at").eq("user_id", userId),
      supabaseAdmin.from("player_claims").select("group_id, status, created_at, resolved_at").eq("claimer_user_id", userId),
      supabaseAdmin.from("user_acquisition").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    return {
      exported_at: new Date().toISOString(),
      user_id: userId,
      lgpd_notice:
        "Este arquivo contém todos os dados pessoais que o RankMyMatch armazena sobre você, conforme o direito de portabilidade da LGPD (Lei 13.709/2018). Para dúvidas, entre em contato em suporte@rankmymatch.app.",
      profile: profileRes.data ?? null,
      acquisition: acquisitionRes.data ?? null,
      group_memberships: membershipsRes.data ?? [],
      matches_played: matchPlayersRes.data ?? [],
      rating_history: ratingsRes.data ?? [],
      season_stats: statsRes.data ?? [],
      round_presence: presenceRes.data ?? [],
      notifications: notificationsRes.data ?? [],
      push_preferences: pushPrefsRes.data ?? [],
      compare_favorites: compareRes.data ?? [],
      bug_reports: bugReportsRes.data ?? [],
      player_claims: claimsRes.data ?? [],
    };
  });
