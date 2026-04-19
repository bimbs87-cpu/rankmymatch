import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isPresenceOpen, getPresenceOpenDate } from "@/lib/presence-schedule";

export interface NextRoundInfo {
  id: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  location: string | null;
  status: string;
  round_number: number | null;
  presence_status: "confirmed" | "declined" | "pending" | null;
  confirmed_count: number;
  max_players: number;
  presence_is_open: boolean;
  presence_opens_at: string | null;
  confirmed_avatars: { user_id: string; name: string; avatar_url: string | null }[];
  confirmed_all: { user_id: string; name: string; avatar_url: string | null; confirmed_at: string | null }[];
  declined_all: { user_id: string; name: string; avatar_url: string | null; confirmed_at: string | null }[];
  pending_all: { user_id: string; name: string; avatar_url: string | null }[];
}

export interface PendingJoinReq {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  message: string | null;
  created_at: string;
  claimed_player_id: string | null;
  claimed_player_name: string | null;
}

export interface PendingClaim {
  id: string;
  claimer_user_id: string;
  claimer_name: string;
  claimer_avatar: string | null;
  placeholder_user_id: string;
  placeholder_name: string;
  created_at: string;
}

export interface PodiumPlayer {
  user_id: string;
  name: string;
  avatar_url: string | null;
  rating: number;
  position: number;
}

export interface ActivityItem {
  id: string;
  kind: "match" | "comment";
  created_at: string;
  text: string;
}

export interface SeasonInfo {
  id: string;
  name: string;
  status: string;
  rounds_done: number;
  rounds_total: number | null;
  match_format: string;
}

export interface GroupDashboardData {
  next_round: NextRoundInfo | null;
  my_position: number | null;
  my_rating: number | null;
  total_ranked: number;
  podium: PodiumPlayer[];
  recent_activity: ActivityItem[];
  current_season: SeasonInfo | null;
  member_count: number;
  pending_join_requests: PendingJoinReq[];
  pending_claims: PendingClaim[];
}

const EMPTY: GroupDashboardData = {
  next_round: null,
  my_position: null,
  my_rating: null,
  total_ranked: 0,
  podium: [],
  recent_activity: [],
  current_season: null,
  member_count: 0,
  pending_join_requests: [],
  pending_claims: [],
};

export function useGroupDashboard(groupId: string | null) {
  const { user } = useAuth();
  const [data, setData] = useState<GroupDashboardData>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!groupId) {
      setData(EMPTY);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      // Member count
      const { data: countData } = await supabase.rpc("get_group_member_count", { _group_id: groupId });
      const memberCount = countData || 0;

      // Current season
      const { data: seasons } = await supabase
        .from("seasons")
        .select("id, name, status, total_rounds, match_format")
        .eq("group_id", groupId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      const currentSeason = seasons?.[0] || null;

      // Rounds for current season (or group fallback)
      let roundsDone = 0;
      let roundsTotal: number | null = currentSeason?.total_rounds ?? null;
      if (currentSeason) {
        const { data: rs } = await supabase
          .from("rounds")
          .select("id, status")
          .eq("season_id", currentSeason.id);
        roundsDone = (rs || []).filter((r) => ["completed", "finished", "done"].includes(r.status)).length;
        if (roundsTotal == null) roundsTotal = rs?.length ?? 0;
      }

      // Group presence config
      const { data: groupCfg } = await supabase
        .from("groups")
        .select("presence_open_mode, presence_open_time")
        .eq("id", groupId)
        .maybeSingle();
      const presenceCfg = {
        presence_open_mode: groupCfg?.presence_open_mode || "always",
        presence_open_time: groupCfg?.presence_open_time || "10:00:00",
      };

      // Next round (scheduled / open / in_progress) for the group
      const { data: nextRounds } = await supabase
        .from("rounds")
        .select("id, scheduled_date, scheduled_time, location, status, round_number, max_players")
        .eq("group_id", groupId)
        .in("status", ["scheduled", "open", "in_progress", "presence_open"])
        .order("scheduled_date", { ascending: true, nullsFirst: false })
        .limit(1);
      let nextRound: NextRoundInfo | null = null;
      if (nextRounds?.[0]) {
        const r = nextRounds[0];
        const { data: presences } = await supabase
          .from("round_presence")
          .select("user_id, status, confirmed_at")
          .eq("round_id", r.id);
        const confirmedList = (presences || []).filter((p) => p.status === "confirmed");
        const declinedList = (presences || []).filter((p) => p.status === "declined");
        const confirmed = confirmedList.length;
        const mine = user ? (presences || []).find((p) => p.user_id === user.id) : null;
        const open = isPresenceOpen(presenceCfg, r.scheduled_date, r.scheduled_time, r.id);
        const opensAt = open ? null : getPresenceOpenDate(presenceCfg, r.scheduled_date, r.scheduled_time, r.id);

        // Active members of the group → derive "pending" = members with no confirmed/declined record
        const { data: activeMembers } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", groupId)
          .eq("status", "active");
        const respondedIds = new Set((presences || []).map((p) => p.user_id));
        const pendingMemberIds = (activeMembers || [])
          .map((m) => m.user_id)
          .filter((uid) => !respondedIds.has(uid));

        // Fetch profiles for ALL involved players
        const sortedConfirmedAll = [...confirmedList].sort(
          (a, b) => new Date(b.confirmed_at || 0).getTime() - new Date(a.confirmed_at || 0).getTime()
        );
        const sortedDeclinedAll = [...declinedList].sort(
          (a, b) => new Date(b.confirmed_at || 0).getTime() - new Date(a.confirmed_at || 0).getTime()
        );
        const allInvolvedIds = [
          ...new Set([
            ...sortedConfirmedAll.map((p) => p.user_id),
            ...sortedDeclinedAll.map((p) => p.user_id),
            ...pendingMemberIds,
          ]),
        ];
        let confirmedAvatars: NextRoundInfo["confirmed_avatars"] = [];
        let confirmedAll: NextRoundInfo["confirmed_all"] = [];
        let declinedAll: NextRoundInfo["declined_all"] = [];
        let pendingAll: NextRoundInfo["pending_all"] = [];
        if (allInvolvedIds.length) {
          const { data: profs } = await supabase
            .from("user_profiles")
            .select("user_id, name, nickname, avatar_url")
            .in("user_id", allInvolvedIds);
          const profMap = new Map((profs || []).map((p) => [p.user_id, p]));
          const nameOf = (uid: string) => {
            const prof = profMap.get(uid);
            return prof?.nickname || prof?.name || "Jogador";
          };
          confirmedAll = sortedConfirmedAll.map((p) => {
            const prof = profMap.get(p.user_id);
            return {
              user_id: p.user_id,
              name: nameOf(p.user_id),
              avatar_url: prof?.avatar_url ?? null,
              confirmed_at: p.confirmed_at ?? null,
            };
          });
          declinedAll = sortedDeclinedAll.map((p) => {
            const prof = profMap.get(p.user_id);
            return {
              user_id: p.user_id,
              name: nameOf(p.user_id),
              avatar_url: prof?.avatar_url ?? null,
              confirmed_at: p.confirmed_at ?? null,
            };
          });
          pendingAll = pendingMemberIds.map((uid) => {
            const prof = profMap.get(uid);
            return {
              user_id: uid,
              name: nameOf(uid),
              avatar_url: prof?.avatar_url ?? null,
            };
          });
          confirmedAvatars = confirmedAll.slice(0, 3).map((p) => ({
            user_id: p.user_id,
            name: p.name,
            avatar_url: p.avatar_url,
          }));
        }

        nextRound = {
          id: r.id,
          scheduled_date: r.scheduled_date,
          scheduled_time: r.scheduled_time,
          location: r.location,
          status: r.status,
          round_number: r.round_number,
          presence_status: (mine?.status as NextRoundInfo["presence_status"]) ?? null,
          confirmed_count: confirmed,
          max_players: r.max_players,
          presence_is_open: open,
          presence_opens_at: opensAt ? opensAt.toISOString() : null,
          confirmed_avatars: confirmedAvatars,
          confirmed_all: confirmedAll,
          declined_all: declinedAll,
          pending_all: pendingAll,
        };
      }

      // Ranking — latest snapshot per user for current season
      let podium: PodiumPlayer[] = [];
      let myPos: number | null = null;
      let myRating: number | null = null;
      let totalRanked = 0;
      if (currentSeason) {
        const { data: snaps } = await supabase
          .from("ranking_snapshots")
          .select("user_id, rating, position, snapshot_date, is_eligible")
          .eq("season_id", currentSeason.id)
          .order("snapshot_date", { ascending: false });
        // Keep latest per user
        const latest = new Map<string, { rating: number; position: number | null }>();
        for (const s of snaps || []) {
          if (!latest.has(s.user_id)) latest.set(s.user_id, { rating: Number(s.rating), position: s.position });
        }
        const sorted = [...latest.entries()]
          .map(([uid, v]) => ({ user_id: uid, rating: v.rating, position: v.position }))
          .sort((a, b) => b.rating - a.rating)
          .map((p, idx) => ({ ...p, position: idx + 1 }));
        totalRanked = sorted.length;
        if (user) {
          const me = sorted.find((p) => p.user_id === user.id);
          myPos = me?.position ?? null;
          myRating = me?.rating ?? null;
        }
        const top3 = sorted.slice(0, 3);
        if (top3.length) {
          const ids = top3.map((p) => p.user_id);
          const { data: profs } = await supabase
            .from("user_profiles")
            .select("user_id, name, nickname, avatar_url")
            .in("user_id", ids);
          const profMap = new Map((profs || []).map((p) => [p.user_id, p]));
          podium = top3.map((p) => {
            const prof = profMap.get(p.user_id);
            return {
              user_id: p.user_id,
              name: prof?.nickname || prof?.name || "Jogador",
              avatar_url: prof?.avatar_url ?? null,
              rating: Math.round(p.rating),
              position: p.position,
            };
          });
        }
      }

      // Recent activity: last 3 comments + last 3 finished matches
      const [commentsRes, matchesRes] = await Promise.all([
        supabase
          .from("comments")
          .select("id, content, created_at, user_id")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("rounds")
          .select("id, round_number, scheduled_date")
          .eq("group_id", groupId)
          .eq("status", "completed")
          .order("scheduled_date", { ascending: false })
          .limit(3),
      ]);

      const userIds = [...new Set((commentsRes.data || []).map((c) => c.user_id))];
      let nameMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("user_profiles")
          .select("user_id, name, nickname")
          .in("user_id", userIds);
        nameMap = new Map((profs || []).map((p) => [p.user_id, p.nickname || p.name || "Jogador"]));
      }

      const activity: ActivityItem[] = [];
      for (const c of commentsRes.data || []) {
        activity.push({
          id: c.id,
          kind: "comment",
          created_at: c.created_at,
          text: `${nameMap.get(c.user_id) || "Alguém"}: ${c.content.slice(0, 60)}${c.content.length > 60 ? "…" : ""}`,
        });
      }
      for (const r of matchesRes.data || []) {
        activity.push({
          id: r.id,
          kind: "match",
          created_at: r.scheduled_date || new Date().toISOString(),
          text: `Rodada ${r.round_number ?? ""} concluída`,
        });
      }
      activity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Pending join requests (admin-only; RLS will return [] for non-admins)
      let pendingJoinRequests: PendingJoinReq[] = [];
      const { data: reqs } = await supabase
        .from("group_join_requests")
        .select("id, user_id, message, created_at, claimed_player_id")
        .eq("group_id", groupId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (reqs && reqs.length) {
        const reqUserIds = [...new Set(reqs.map((r) => r.user_id))];
        const claimedIds = [...new Set(reqs.map((r) => r.claimed_player_id).filter(Boolean) as string[])];
        const allIds = [...new Set([...reqUserIds, ...claimedIds])];
        const { data: profs } = await supabase
          .from("user_profiles")
          .select("user_id, name, nickname, avatar_url")
          .in("user_id", allIds);
        const profMap = new Map((profs || []).map((p) => [p.user_id, p]));
        pendingJoinRequests = reqs.map((r) => {
          const p = profMap.get(r.user_id);
          const cp = r.claimed_player_id ? profMap.get(r.claimed_player_id) : null;
          return {
            id: r.id,
            user_id: r.user_id,
            user_name: p?.nickname || p?.name || "Jogador",
            user_avatar: p?.avatar_url ?? null,
            message: r.message,
            created_at: r.created_at,
            claimed_player_id: r.claimed_player_id,
            claimed_player_name: cp ? (cp.nickname || cp.name || null) : null,
          };
        });
      }

      setData({
        next_round: nextRound,
        my_position: myPos,
        my_rating: myRating,
        total_ranked: totalRanked,
        podium,
        recent_activity: activity.slice(0, 4),
        current_season: currentSeason
          ? {
              id: currentSeason.id,
              name: currentSeason.name,
              status: currentSeason.status,
              rounds_done: roundsDone,
              rounds_total: roundsTotal,
              match_format: currentSeason.match_format,
            }
          : null,
        member_count: memberCount,
        pending_join_requests: pendingJoinRequests,
      });
    } catch (err) {
      console.error("Erro ao carregar dashboard do grupo:", err);
      setData(EMPTY);
    } finally {
      setIsLoading(false);
    }
  }, [groupId, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, isLoading, refresh };
}
