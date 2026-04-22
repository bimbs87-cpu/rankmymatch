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
  has_profile: boolean;
  has_match: boolean;
  is_placeholder: boolean;
};

type AuthUser = {
  id: string;
  email?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown>;
};

/** Pagina TODOS os auth.users (não só os primeiros 1000). */
async function listAllAuthUsers(): Promise<AuthUser[]> {
  const all: AuthUser[] = [];
  const perPage = 1000;
  let page = 1;
  // hard cap em 20 páginas (20k users) só por segurança
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new Error(error.message);
    const batch = (data?.users ?? []) as AuthUser[];
    all.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return all;
}

export const getDevDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    console.log("[getDevDashboard] start, userId=", context.userId);
    await ensureAppAdmin(context.userId);
    console.log("[getDevDashboard] admin OK, listing users...");

    // ===== auth.users (paginado completo) =====
    let authUsers: AuthUser[] = [];
    try {
      authUsers = await listAllAuthUsers();
      console.log("[getDevDashboard] listUsers OK, count=", authUsers.length);
    } catch (e) {
      console.error("[getDevDashboard] listUsers FAILED:", e);
      throw new Error(
        `auth.admin.listUsers failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const userIds = authUsers.map((u) => u.id);
    const sentinelIds = userIds.length
      ? userIds
      : ["00000000-0000-0000-0000-000000000000"];

    // ===== profiles (TODOS os profiles, inclusive placeholders) =====
    const { data: allProfiles } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id, name, nickname, is_placeholder, created_at");
    const profileByUser = new Map(
      (allProfiles ?? []).map((p) => [p.user_id, p])
    );
    const realProfiles = (allProfiles ?? []).filter((p) => !p.is_placeholder);
    const placeholderProfiles = (allProfiles ?? []).filter(
      (p) => p.is_placeholder
    );

    // ===== grupos criados por usuário =====
    const { data: groups } = await supabaseAdmin
      .from("groups")
      .select("id, name, sport, created_by, created_at")
      .order("created_at", { ascending: true });

    const groupsByCreator = new Map<string, NonNullable<typeof groups>>();
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
        memberCountByGroup.set(
          m.group_id,
          (memberCountByGroup.get(m.group_id) ?? 0) + 1
        );
      });
    }

    // ===== inferir origem via primeira membership não-criadora =====
    const { data: allMemberships } = await supabaseAdmin
      .from("group_members")
      .select("user_id, group_id, joined_at, role")
      .in("user_id", sentinelIds)
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
    const userIdsWithMatch = new Set(
      (matchPlayersAll ?? []).map((m) => m.user_id)
    );

    // ===== monta linhas de cadastros =====
    const signups: SignupRow[] = authUsers.map((u) => {
      const profile = profileByUser.get(u.id);
      const userGroups = groupsByCreator.get(u.id) ?? [];
      const firstGroup = userGroups[0];
      const firstJoin = firstNonCreatorJoinByUser.get(u.id);
      let origin: "invite" | "direct" | "unknown" = "unknown";
      if (firstJoin) {
        const diffMs =
          new Date(firstJoin).getTime() - new Date(u.created_at).getTime();
        if (diffMs >= -60_000 && diffMs <= 24 * 3600_000) origin = "invite";
        else origin = "direct";
      } else if (userGroups.length > 0) {
        origin = "direct";
      }
      return {
        user_id: u.id,
        email: u.email ?? null,
        name:
          profile?.name ?? (u.user_metadata?.full_name as string) ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        groups_created: userGroups.length,
        first_group_name: firstGroup?.name ?? null,
        first_group_sport: firstGroup?.sport ?? null,
        first_group_members: firstGroup
          ? memberCountByGroup.get(firstGroup.id) ?? 0
          : 0,
        origin,
        has_profile: Boolean(profile),
        has_match: userIdsWithMatch.has(u.id),
        is_placeholder: Boolean(profile?.is_placeholder),
      };
    });

    signups.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // ===== Overview enriquecido =====
    const now = Date.now();
    const dayMs = 24 * 3600_000;
    const totalUsers = authUsers.length;
    const totalGroups = groups?.length ?? 0;

    const { count: totalMatches } = await supabaseAdmin
      .from("matches")
      .select("*", { count: "exact", head: true });

    // Cadastros por janela de tempo
    const signupsToday = authUsers.filter(
      (u) =>
        new Date(u.created_at).toDateString() === new Date().toDateString()
    ).length;
    const signupsLast7d = authUsers.filter(
      (u) => now - new Date(u.created_at).getTime() < 7 * dayMs
    ).length;
    const signupsLast30d = authUsers.filter(
      (u) => now - new Date(u.created_at).getTime() < 30 * dayMs
    ).length;

    // Profiles órfãos (sem auth.user) — placeholders criados pelo admin
    const authUserIdSet = new Set(userIds);
    const profilesWithoutAuth = (allProfiles ?? []).filter(
      (p) => !authUserIdSet.has(p.user_id)
    );

    // Cadastros sem profile (anomalia — usuário criou conta mas trigger falhou)
    const authWithoutProfile = signups.filter(
      (s) => !s.has_profile && !s.is_placeholder
    );

    // ===== Atividade diária últimos 30 dias =====
    const dailyActivity: { date: string; users: number; signups: number }[] =
      [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(now - i * dayMs);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + dayMs);
      const date = dayStart.toISOString().slice(0, 10);
      const users = authUsers.filter((u) => {
        const t = u.last_sign_in_at
          ? new Date(u.last_sign_in_at).getTime()
          : 0;
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
        u.last_sign_in_at &&
        now - new Date(u.last_sign_in_at).getTime() < dayMs
    ).length;
    const wau = authUsers.filter(
      (u) =>
        u.last_sign_in_at &&
        now - new Date(u.last_sign_in_at).getTime() < 7 * dayMs
    ).length;
    const mau = authUsers.filter(
      (u) =>
        u.last_sign_in_at &&
        now - new Date(u.last_sign_in_at).getTime() < 30 * dayMs
    ).length;

    // Retornantes 7d: usuários cujo cadastro tem >7d e voltaram nos últimos 7d
    const returningLast7d = authUsers.filter((u) => {
      const created = new Date(u.created_at).getTime();
      const lastSign = u.last_sign_in_at
        ? new Date(u.last_sign_in_at).getTime()
        : 0;
      return (
        now - created > 7 * dayMs && lastSign && now - lastSign < 7 * dayMs
      );
    }).length;

    // Nunca voltaram: cadastrou há mais de 24h e nunca logou de novo (last_sign == created)
    const neverReturned = authUsers.filter((u) => {
      const created = new Date(u.created_at).getTime();
      if (now - created < dayMs) return false;
      const lastSign = u.last_sign_in_at
        ? new Date(u.last_sign_in_at).getTime()
        : created;
      return lastSign - created < 60_000;
    }).length;

    // ===== Funil =====
    const usersWithGroup = new Set((groups ?? []).map((g) => g.created_by));
    const usersWithMatch = userIdsWithMatch;

    const funnel = {
      signed_up: totalUsers,
      created_group: usersWithGroup.size,
      registered_match: Array.from(usersWithMatch).filter((id) =>
        userIds.includes(id)
      ).length,
    };

    // ===== Sessions (real activity) =====
    type SessRow = { user_id: string; session_date: string };
    const { data: sessionsRowsRaw } = await (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            in: (
              col: string,
              vals: string[]
            ) => Promise<{ data: SessRow[] | null }>;
          };
        };
      }
    )
      .from("user_sessions")
      .select("user_id, session_date")
      .in("user_id", sentinelIds);
    const sessionsRows: SessRow[] = sessionsRowsRaw ?? [];

    const sessionsByUser = new Map<string, number[]>();
    sessionsRows.forEach((s) => {
      const t = new Date(s.session_date).getTime();
      const arr = sessionsByUser.get(s.user_id) ?? [];
      arr.push(t);
      sessionsByUser.set(s.user_id, arr);
    });

    // ===== Cohorts =====
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
      const c = cohortMap.get(week) ?? {
        week,
        size: 0,
        d1: 0,
        d7: 0,
        d30: 0,
      };
      c.size += 1;

      const createdT = created.getTime();
      const userSessions = sessionsByUser.get(u.id) ?? [];
      const lastSignIn = u.last_sign_in_at
        ? new Date(u.last_sign_in_at).getTime()
        : 0;
      const allTimes = userSessions.length
        ? userSessions
        : lastSignIn
          ? [lastSignIn]
          : [];

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
    type AcqRow = {
      user_id: string;
      utm_source: string | null;
      utm_medium: string | null;
      utm_campaign: string | null;
      invite_code: string | null;
      referrer: string | null;
      landing_path: string | null;
      created_at: string;
    };
    const { data: acqRowsRaw } = await (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (cols: string) => Promise<{ data: AcqRow[] | null }>;
        };
      }
    )
      .from("user_acquisition")
      .select(
        "user_id, utm_source, utm_medium, utm_campaign, invite_code, referrer, landing_path, created_at"
      );
    const acqRows: AcqRow[] = acqRowsRaw ?? [];

    const acqByUser = new Map<string, AcqRow>();
    acqRows.forEach((a) => acqByUser.set(a.user_id, a));

    // Breakdown por canal
    const channelCount = new Map<string, number>();
    const sourceCount = new Map<string, number>();
    const campaignCount = new Map<string, number>();
    const referrerCount = new Map<string, number>();
    const landingCount = new Map<string, number>();

    authUsers.forEach((u) => {
      const acq = acqByUser.get(u.id);
      let channel = "direct";
      if (acq?.invite_code) channel = "invite";
      else if (acq?.utm_source) channel = `utm:${acq.utm_source}`;
      else if (acq?.referrer) channel = `referrer`;
      else if (!acq) channel = "untracked";
      channelCount.set(channel, (channelCount.get(channel) ?? 0) + 1);

      if (acq?.utm_source)
        sourceCount.set(
          acq.utm_source,
          (sourceCount.get(acq.utm_source) ?? 0) + 1
        );
      if (acq?.utm_campaign)
        campaignCount.set(
          acq.utm_campaign,
          (campaignCount.get(acq.utm_campaign) ?? 0) + 1
        );
      if (acq?.referrer)
        referrerCount.set(
          acq.referrer,
          (referrerCount.get(acq.referrer) ?? 0) + 1
        );
      if (acq?.landing_path)
        landingCount.set(
          acq.landing_path,
          (landingCount.get(acq.landing_path) ?? 0) + 1
        );
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
      landingPaths: toArr(landingCount),
      tracked: acqRows.length,
      untracked: authUsers.length - acqRows.length,
    };

    // ===== Atividade recente: últimos 15 cadastros + atividade =====
    const recentActivity = signups.slice(0, 15).map((s) => ({
      user_id: s.user_id,
      name: s.name,
      email: s.email,
      created_at: s.created_at,
      last_sign_in_at: s.last_sign_in_at,
      origin: s.origin,
      has_profile: s.has_profile,
      has_match: s.has_match,
      groups_created: s.groups_created,
    }));

    // Enriquecer signups com canal de aquisição
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
        landing_path: acq?.landing_path ?? null,
      };
    });

    // ===== Tráfego do site (TODOS os visitantes, inclusive anônimos) =====
    type VisitRow = {
      session_id: string;
      user_id: string | null;
      path: string;
      referrer_host: string | null;
      utm_source: string | null;
      utm_medium: string | null;
      utm_campaign: string | null;
      invite_code: string | null;
      is_first_visit: boolean;
      device_type: string | null;
      created_at: string;
    };

    const thirtyDaysAgo = new Date(now - 30 * dayMs).toISOString();
    const { data: visitsRaw } = await supabaseAdmin
      .from("page_visits")
      .select(
        "session_id, user_id, path, referrer_host, utm_source, utm_medium, utm_campaign, invite_code, is_first_visit, device_type, created_at"
      )
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(50000);
    const visits: VisitRow[] = (visitsRaw ?? []) as VisitRow[];

    const visits24h = visits.filter(
      (v) => now - new Date(v.created_at).getTime() < dayMs
    );
    const visits7d = visits.filter(
      (v) => now - new Date(v.created_at).getTime() < 7 * dayMs
    );
    const visitsToday = visits.filter((v) => {
      const d = new Date(v.created_at);
      return d.toDateString() === new Date().toDateString();
    });

    const sessionsAll = new Set(visits.map((v) => v.session_id));
    const sessionsToday = new Set(visitsToday.map((v) => v.session_id));
    const sessions7d = new Set(visits7d.map((v) => v.session_id));
    const sessions24h = new Set(visits24h.map((v) => v.session_id));

    const firstVisitsToday = visitsToday.filter((v) => v.is_first_visit).length;
    const firstVisits7d = visits7d.filter((v) => v.is_first_visit).length;
    const firstVisits30d = visits.filter((v) => v.is_first_visit).length;

    const sessionUserMap = new Map<string, string | null>();
    visits.forEach((v) => {
      if (!sessionUserMap.has(v.session_id)) {
        sessionUserMap.set(v.session_id, v.user_id);
      } else if (!sessionUserMap.get(v.session_id) && v.user_id) {
        sessionUserMap.set(v.session_id, v.user_id);
      }
    });
    const anonSessions7d = Array.from(sessions7d).filter(
      (s) => !sessionUserMap.get(s)
    ).length;
    const authSessions7d = sessions7d.size - anonSessions7d;

    const sessionPageCount = new Map<string, number>();
    visits7d.forEach((v) => {
      sessionPageCount.set(
        v.session_id,
        (sessionPageCount.get(v.session_id) ?? 0) + 1
      );
    });
    const bouncedSessions = Array.from(sessionPageCount.values()).filter(
      (c) => c === 1
    ).length;
    const bounceRate7d =
      sessions7d.size > 0
        ? Math.round((bouncedSessions / sessions7d.size) * 100)
        : 0;

    const pagesPerSession7d =
      sessions7d.size > 0
        ? Number((visits7d.length / sessions7d.size).toFixed(1))
        : 0;

    const userCreatedAtMap = new Map<string, number>();
    authUsers.forEach((u) =>
      userCreatedAtMap.set(u.id, new Date(u.created_at).getTime())
    );
    const sessionsConverted7d = new Set<string>();
    visits7d.forEach((v) => {
      if (!v.user_id) return;
      const userCreated = userCreatedAtMap.get(v.user_id);
      if (!userCreated) return;
      const visitTime = new Date(v.created_at).getTime();
      if (Math.abs(visitTime - userCreated) < 2 * 3600_000) {
        sessionsConverted7d.add(v.session_id);
      }
    });
    const visitorToSignupRate7d =
      sessions7d.size > 0
        ? Number(((sessionsConverted7d.size / sessions7d.size) * 100).toFixed(1))
        : 0;

    const visitUtmSource = new Map<string, number>();
    const visitReferrer = new Map<string, number>();
    const visitLanding = new Map<string, number>();
    const visitCampaign = new Map<string, number>();
    const visitDevice = new Map<string, number>();
    const visitInvite = new Map<string, number>();

    const seenSession = new Set<string>();
    const visitsAsc = [...visits].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    visitsAsc.forEach((v) => {
      if (seenSession.has(v.session_id)) return;
      seenSession.add(v.session_id);
      if (v.utm_source)
        visitUtmSource.set(
          v.utm_source,
          (visitUtmSource.get(v.utm_source) ?? 0) + 1
        );
      if (v.utm_campaign)
        visitCampaign.set(
          v.utm_campaign,
          (visitCampaign.get(v.utm_campaign) ?? 0) + 1
        );
      if (v.referrer_host)
        visitReferrer.set(
          v.referrer_host,
          (visitReferrer.get(v.referrer_host) ?? 0) + 1
        );
      if (v.invite_code)
        visitInvite.set(
          v.invite_code,
          (visitInvite.get(v.invite_code) ?? 0) + 1
        );
      visitLanding.set(v.path, (visitLanding.get(v.path) ?? 0) + 1);
      const dev = v.device_type ?? "unknown";
      visitDevice.set(dev, (visitDevice.get(dev) ?? 0) + 1);
    });

    const pageViewCount = new Map<string, number>();
    visits7d.forEach((v) => {
      pageViewCount.set(v.path, (pageViewCount.get(v.path) ?? 0) + 1);
    });

    // ===== Conversão visitor→signup por canal (UTM source / referrer) — 7d =====
    // Pegamos a primeira visita de cada sessão (touch inicial) e marcamos se converteu.
    const sessionFirstTouch = new Map<
      string,
      { utm_source: string | null; referrer_host: string | null; landing: string }
    >();
    visitsAsc.forEach((v) => {
      if (sessionFirstTouch.has(v.session_id)) return;
      sessionFirstTouch.set(v.session_id, {
        utm_source: v.utm_source,
        referrer_host: v.referrer_host,
        landing: v.path,
      });
    });

    // Filtra para sessões dentro de 7d
    const sessions7dIds = new Set(visits7d.map((v) => v.session_id));
    type ConvBucket = { sessions: number; converted: number };
    const utmConvMap = new Map<string, ConvBucket>();
    const refConvMap = new Map<string, ConvBucket>();
    const landingConvMap = new Map<string, ConvBucket>();
    const landingBounceMap = new Map<
      string,
      { sessions: number; bounced: number }
    >();

    sessions7dIds.forEach((sid) => {
      const ft = sessionFirstTouch.get(sid);
      if (!ft) return;
      const converted = sessionsConverted7d.has(sid);
      const utmKey = ft.utm_source ?? "(nenhum)";
      const refKey = ft.referrer_host ?? "(direto)";
      const landKey = ft.landing;

      const utmB = utmConvMap.get(utmKey) ?? { sessions: 0, converted: 0 };
      utmB.sessions += 1;
      if (converted) utmB.converted += 1;
      utmConvMap.set(utmKey, utmB);

      const refB = refConvMap.get(refKey) ?? { sessions: 0, converted: 0 };
      refB.sessions += 1;
      if (converted) refB.converted += 1;
      refConvMap.set(refKey, refB);

      const landB = landingConvMap.get(landKey) ?? { sessions: 0, converted: 0 };
      landB.sessions += 1;
      if (converted) landB.converted += 1;
      landingConvMap.set(landKey, landB);

      const pageCount = sessionPageCount.get(sid) ?? 0;
      const bounceB = landingBounceMap.get(landKey) ?? {
        sessions: 0,
        bounced: 0,
      };
      bounceB.sessions += 1;
      if (pageCount === 1) bounceB.bounced += 1;
      landingBounceMap.set(landKey, bounceB);
    });

    const toConvArr = (m: Map<string, ConvBucket>) =>
      Array.from(m.entries())
        .map(([key, b]) => ({
          key,
          sessions: b.sessions,
          converted: b.converted,
          rate:
            b.sessions > 0
              ? Number(((b.converted / b.sessions) * 100).toFixed(1))
              : 0,
        }))
        .filter((r) => r.sessions >= 2) // só ranquear canais com mínima amostra
        .sort((a, b) => b.sessions - a.sessions);

    const utmConversion7d = toConvArr(utmConvMap);
    const referrerConversion7d = toConvArr(refConvMap);
    const landingConversion7d = toConvArr(landingConvMap);

    const landingBounce7d = Array.from(landingBounceMap.entries())
      .map(([key, b]) => ({
        key,
        sessions: b.sessions,
        bounced: b.bounced,
        bounceRate:
          b.sessions > 0
            ? Number(((b.bounced / b.sessions) * 100).toFixed(1))
            : 0,
      }))
      .filter((r) => r.sessions >= 3)
      .sort((a, b) => b.bounceRate - a.bounceRate);

    const trafficDaily: {
      date: string;
      sessions: number;
      pageviews: number;
      newVisitors: number;
    }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(now - i * dayMs);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + dayMs);
      const date = dayStart.toISOString().slice(0, 10);
      const dayVisits = visits.filter((v) => {
        const t = new Date(v.created_at).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      });
      const daySessions = new Set(dayVisits.map((v) => v.session_id));
      const dayNew = dayVisits.filter((v) => v.is_first_visit).length;
      trafficDaily.push({
        date,
        sessions: daySessions.size,
        pageviews: dayVisits.length,
        newVisitors: dayNew,
      });
    }

    const traffic = {
      hasData: visits.length > 0,
      totalVisits30d: visits.length,
      totalSessions30d: sessionsAll.size,
      sessionsToday: sessionsToday.size,
      sessions24h: sessions24h.size,
      sessions7d: sessions7d.size,
      pageviewsToday: visitsToday.length,
      pageviews7d: visits7d.length,
      firstVisitsToday,
      firstVisits7d,
      firstVisits30d,
      anonSessions7d,
      authSessions7d,
      bounceRate7d,
      pagesPerSession7d,
      visitorToSignupRate7d,
      sessionsConverted7d: sessionsConverted7d.size,
      topUtmSources: toArr(visitUtmSource).slice(0, 10),
      topCampaigns: toArr(visitCampaign).slice(0, 10),
      topReferrers: toArr(visitReferrer).slice(0, 10),
      topLandingPages: toArr(visitLanding).slice(0, 10),
      topPages7d: toArr(pageViewCount).slice(0, 10),
      topInviteCodes: toArr(visitInvite).slice(0, 10),
      devices: toArr(visitDevice),
      trafficDaily,
      utmConversion7d,
      referrerConversion7d,
      landingConversion7d,
      landingBounce7d,
    };

    // ===== Onboarding events (funil pós-signup) =====
    type OnbRow = { user_id: string; step: string; created_at: string };
    const { data: onbRowsRaw } = await supabaseAdmin
      .from("onboarding_events")
      .select("user_id, step, created_at")
      .gte("created_at", thirtyDaysAgo);
    const onbRows: OnbRow[] = (onbRowsRaw ?? []) as OnbRow[];

    const stepOrder: { key: string; label: string }[] = [
      { key: "signup", label: "Cadastro" },
      { key: "profile_completed", label: "Completou perfil" },
      { key: "joined_first_group", label: "Entrou em grupo" },
      { key: "created_first_group", label: "Criou grupo" },
      { key: "first_match_result", label: "Lançou 1ª partida" },
    ];
    const stepCounts = new Map<string, Set<string>>();
    onbRows.forEach((r) => {
      const set = stepCounts.get(r.step) ?? new Set<string>();
      set.add(r.user_id);
      stepCounts.set(r.step, set);
    });
    const onboardingFunnel = stepOrder.map((s) => ({
      key: s.key,
      label: s.label,
      users: stepCounts.get(s.key)?.size ?? 0,
    }));

    return {
      overview: {
        totalUsers,
        totalGroups,
        totalMatches: totalMatches ?? 0,
        dau,
        wau,
        mau,
        sessionsTracked: sessionsRows.length,
        acquisitionTracked: acqRows.length,
        signupsToday,
        signupsLast7d,
        signupsLast30d,
        returningLast7d,
        neverReturned,
        realProfiles: realProfiles.length,
        placeholderProfiles: placeholderProfiles.length,
        profilesWithoutAuth: profilesWithoutAuth.length,
        authWithoutProfile: authWithoutProfile.length,
        usersWithGroup: usersWithGroup.size,
        usersWithMatch: funnel.registered_match,
      },
      traffic,
      dailyActivity,
      signups: signupsEnriched,
      funnel,
      cohorts,
      acquisition,
      recentActivity,
      diagnostics: {
        authWithoutProfile: authWithoutProfile.map((s) => ({
          user_id: s.user_id,
          email: s.email,
          created_at: s.created_at,
        })),
        profilesWithoutAuth: profilesWithoutAuth.map((p) => ({
          user_id: p.user_id,
          name: p.name,
          is_placeholder: p.is_placeholder,
          created_at: p.created_at,
        })),
      },
    };
  });
