import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Verifica se o caller é app_admin. Throw caso contrário. */
async function ensureAppAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data) throw new Error("Forbidden: not an app admin");
}

type SignupRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  groups_created: number;
  first_group_name: string | null;
  first_group_sport: string | null;
  first_group_members: number;
  origin: "invite" | "direct" | "unknown";
};

export const getDevDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    console.log("[getDevDashboard] start, userId=", context.userId);
    await ensureAppAdmin(context.userId);
    console.log("[getDevDashboard] admin OK, listing users...");

    // ===== auth.users (paginado, pega até 1000 — suficiente por enquanto) =====
    let authUsers: Array<{
      id: string;
      email?: string | null;
      created_at: string;
      last_sign_in_at?: string | null;
      user_metadata?: Record<string, unknown>;
    }> = [];
    try {
      const { data: usersPage, error: usersErr } =
        await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersErr) throw new Error(usersErr.message);
      authUsers = (usersPage?.users ?? []) as typeof authUsers;
      console.log("[getDevDashboard] listUsers OK, count=", authUsers.length);
    } catch (e) {
      console.error("[getDevDashboard] listUsers FAILED:", e);
      throw new Error(
        `auth.admin.listUsers failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const userIds = authUsers.map((u) => u.id);

    // ===== profiles =====
    const { data: profiles } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id, name, nickname")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    // ===== grupos criados por usuário =====
    const { data: groups } = await supabaseAdmin
      .from("groups")
      .select("id, name, sport, created_by, created_at")
      .in("created_by", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: true });

    const groupsByCreator = new Map<string, typeof groups>();
    (groups ?? []).forEach((g) => {
      const arr = groupsByCreator.get(g.created_by) ?? [];
      arr.push(g);
      groupsByCreator.set(g.created_by, arr);
    });

    // ===== contagem de membros ativos por grupo =====
    const groupIds = (groups ?? []).map((g) => g.id);
    const memberCountByGroup = new Map<string, number>();
    if (groupIds.length) {
      const { data: gms } = await supabaseAdmin
        .from("group_members")
        .select("group_id")
        .in("group_id", groupIds)
        .eq("status", "active");
      (gms ?? []).forEach((m) => {
        memberCountByGroup.set(m.group_id, (memberCountByGroup.get(m.group_id) ?? 0) + 1);
      });
    }

    // ===== inferir origem: usuário entrou em grupo via membership criada nas primeiras 24h? =====
    // Se primeira membership (não criadora) é < 24h após signup → invite.
    const { data: allMemberships } = await supabaseAdmin
      .from("group_members")
      .select("user_id, group_id, joined_at, role")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"])
      .order("joined_at", { ascending: true });

    const firstNonCreatorJoinByUser = new Map<string, string>();
    (allMemberships ?? []).forEach((m) => {
      if (m.role === "creator") return;
      if (!firstNonCreatorJoinByUser.has(m.user_id)) {
        firstNonCreatorJoinByUser.set(m.user_id, m.joined_at);
      }
    });

    // ===== matches por usuário (pra funil) =====
    const { data: matchPlayersAll } = await supabaseAdmin
      .from("match_players")
      .select("user_id");
    const userIdsWithMatch = new Set((matchPlayersAll ?? []).map((m) => m.user_id));

    // ===== monta linhas de cadastros =====
    const signups: SignupRow[] = authUsers.map((u) => {
      const profile = profileByUser.get(u.id);
      const userGroups = groupsByCreator.get(u.id) ?? [];
      const firstGroup = userGroups[0];
      const firstJoin = firstNonCreatorJoinByUser.get(u.id);
      let origin: "invite" | "direct" | "unknown" = "unknown";
      if (firstJoin) {
        const diffMs = new Date(firstJoin).getTime() - new Date(u.created_at).getTime();
        if (diffMs >= -60_000 && diffMs <= 24 * 3600_000) origin = "invite";
        else origin = "direct";
      } else if (userGroups.length > 0) {
        origin = "direct";
      }
      return {
        user_id: u.id,
        email: u.email ?? null,
        name: profile?.name ?? (u.user_metadata?.full_name as string) ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        groups_created: userGroups.length,
        first_group_name: firstGroup?.name ?? null,
        first_group_sport: firstGroup?.sport ?? null,
        first_group_members: firstGroup ? memberCountByGroup.get(firstGroup.id) ?? 0 : 0,
        origin,
      };
    });

    signups.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // ===== Overview =====
    const now = Date.now();
    const dayMs = 24 * 3600_000;
    const totalUsers = authUsers.length;
    const totalGroups = groups?.length ?? 0;

    const { count: totalMatches } = await supabaseAdmin
      .from("matches")
      .select("*", { count: "exact", head: true });

    // ===== Atividade diária últimos 30 dias (baseado em last_sign_in_at) =====
    const dailyActivity: { date: string; users: number; signups: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(now - i * dayMs);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + dayMs);
      const date = dayStart.toISOString().slice(0, 10);
      const users = authUsers.filter((u) => {
        const t = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      }).length;
      const signupsCount = authUsers.filter((u) => {
        const t = new Date(u.created_at).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      }).length;
      dailyActivity.push({ date, users, signups: signupsCount });
    }

    // DAU/WAU/MAU baseado em last_sign_in_at
    const dau = authUsers.filter(
      (u) =>
        u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < dayMs
    ).length;
    const wau = authUsers.filter(
      (u) =>
        u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 7 * dayMs
    ).length;
    const mau = authUsers.filter(
      (u) =>
        u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 30 * dayMs
    ).length;

    // ===== Funil =====
    const usersWithGroup = new Set((groups ?? []).map((g) => g.created_by));
    // Usuários que jogaram (não só criadores) — qualquer membership em group_members
    const usersWithMatch = userIdsWithMatch;

    const funnel = {
      signed_up: totalUsers,
      created_group: usersWithGroup.size,
      registered_match: Array.from(usersWithMatch).filter((id) => userIds.includes(id))
        .length,
    };

    // ===== Retenção REAL via user_sessions =====
    // Para cada cohort semanal, verifica quantos usuários têm sessão registrada
    // em algum dia >= signup + N dias.
    const { data: sessionsRows } = await supabaseAdmin
      .from("user_sessions")
      .select("user_id, session_date")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

    const sessionsByUser = new Map<string, number[]>(); // user_id → array de timestamps
    (sessionsRows ?? []).forEach((s) => {
      const t = new Date(s.session_date as string).getTime();
      const arr = sessionsByUser.get(s.user_id) ?? [];
      arr.push(t);
      sessionsByUser.set(s.user_id, arr);
    });

    type Cohort = {
      week: string;
      size: number;
      d1: number;
      d7: number;
      d30: number;
    };
    const cohortMap = new Map<string, Cohort>();
    authUsers.forEach((u) => {
      const created = new Date(u.created_at);
      const day = created.getUTCDay();
      const diff = (day + 6) % 7;
      const weekStart = new Date(created);
      weekStart.setUTCDate(created.getUTCDate() - diff);
      weekStart.setUTCHours(0, 0, 0, 0);
      const week = weekStart.toISOString().slice(0, 10);
      const c = cohortMap.get(week) ?? { week, size: 0, d1: 0, d7: 0, d30: 0 };
      c.size += 1;

      const createdT = created.getTime();
      const userSessions = sessionsByUser.get(u.id) ?? [];
      // Fallback: se não tiver sessão registrada, usa last_sign_in_at
      const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
      const allTimes = userSessions.length ? userSessions : (lastSignIn ? [lastSignIn] : []);

      const hasReturnAfter = (gapDays: number) =>
        allTimes.some((t) => t - createdT >= gapDays * dayMs);

      if (hasReturnAfter(1)) c.d1 += 1;
      if (hasReturnAfter(7)) c.d7 += 1;
      if (hasReturnAfter(30)) c.d30 += 1;
      cohortMap.set(week, c);
    });
    const cohorts = Array.from(cohortMap.values())
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-12);

    // ===== Aquisição (UTM / invite / direct) =====
    const { data: acqRows } = await supabaseAdmin
      .from("user_acquisition")
      .select("user_id, utm_source, utm_medium, utm_campaign, invite_code, referrer, landing_path, created_at");

    const acqByUser = new Map<string, (typeof acqRows extends Array<infer R> ? R : never)>();
    (acqRows ?? []).forEach((a) => acqByUser.set(a.user_id, a));

    // Breakdown por canal
    const channelCount = new Map<string, number>();
    const sourceCount = new Map<string, number>();
    const campaignCount = new Map<string, number>();
    const referrerCount = new Map<string, number>();

    authUsers.forEach((u) => {
      const acq = acqByUser.get(u.id);
      let channel = "direct";
      if (acq?.invite_code) channel = "invite";
      else if (acq?.utm_source) channel = `utm:${acq.utm_source}`;
      else if (acq?.referrer) channel = `referrer`;
      else if (!acq) channel = "untracked";
      channelCount.set(channel, (channelCount.get(channel) ?? 0) + 1);

      if (acq?.utm_source) sourceCount.set(acq.utm_source, (sourceCount.get(acq.utm_source) ?? 0) + 1);
      if (acq?.utm_campaign) campaignCount.set(acq.utm_campaign, (campaignCount.get(acq.utm_campaign) ?? 0) + 1);
      if (acq?.referrer) referrerCount.set(acq.referrer, (referrerCount.get(acq.referrer) ?? 0) + 1);
    });

    const toArr = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);

    const acquisition = {
      channels: toArr(channelCount),
      utmSources: toArr(sourceCount),
      utmCampaigns: toArr(campaignCount),
      referrers: toArr(referrerCount),
      tracked: acqRows?.length ?? 0,
      untracked: authUsers.length - (acqRows?.length ?? 0),
    };

    // Enriquecer signups com canal de aquisição (override do origin antigo se houver dado real)
    const signupsEnriched = signups.map((s) => {
      const acq = acqByUser.get(s.user_id);
      let channel: string = s.origin;
      if (acq?.invite_code) channel = "invite";
      else if (acq?.utm_source) channel = `utm:${acq.utm_source}`;
      else if (acq?.referrer) channel = "referrer";
      else if (acq) channel = "direct";
      return {
        ...s,
        channel,
        utm_source: acq?.utm_source ?? null,
        utm_campaign: acq?.utm_campaign ?? null,
        invite_code: acq?.invite_code ?? null,
        referrer: acq?.referrer ?? null,
      };
    });

    return {
      overview: {
        totalUsers,
        totalGroups,
        totalMatches: totalMatches ?? 0,
        dau,
        wau,
        mau,
        sessionsTracked: sessionsRows?.length ?? 0,
        acquisitionTracked: acqRows?.length ?? 0,
      },
      dailyActivity,
      signups: signupsEnriched,
      funnel,
      cohorts,
      acquisition,
    };
  });
