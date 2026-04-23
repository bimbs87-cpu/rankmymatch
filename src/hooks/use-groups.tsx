import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";

type Group = Tables<"groups">;
type GroupMember = Tables<"group_members">;

async function attachMemberCounts(groups: Group[]) {
  if (!groups.length) return groups.map((g) => ({ ...g, member_count: 0, is_premium: false }));
  const ids = groups.map((g) => g.id);
  const [{ data: members }, { data: subs }] = await Promise.all([
    supabase.from("group_members").select("group_id").in("group_id", ids).eq("status", "active"),
    supabase.from("group_subscriptions").select("group_id, status, expires_at").in("group_id", ids),
  ]);

  const countMap = new Map<string, number>();
  for (const m of members || []) {
    countMap.set(m.group_id, (countMap.get(m.group_id) || 0) + 1);
  }
  const premiumMap = new Map<string, boolean>();
  for (const s of subs || []) {
    const active = s.status && s.status !== "free" && s.status !== "cancelled";
    const notExpired = !s.expires_at || new Date(s.expires_at) > new Date();
    if (active && notExpired) premiumMap.set(s.group_id, true);
  }
  return groups.map((g) => ({
    ...g,
    member_count: countMap.get(g.id) || 0,
    is_premium: premiumMap.get(g.id) || false,
  }));
}

export interface GroupStats {
  rounds_done: number;
  rounds_total: number;
  seasons_done: number;
  current_season_name: string | null;
}

async function attachGroupStats<T extends { id: string }>(
  groups: T[],
): Promise<(T & GroupStats)[]> {
  if (!groups.length) return [];
  const ids = groups.map((g) => g.id);

  const [roundsRes, seasonsRes] = await Promise.all([
    supabase.from("rounds").select("group_id, status").in("group_id", ids),
    supabase
      .from("seasons")
      .select("group_id, name, status, created_at")
      .in("group_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  const roundsByGroup = new Map<string, { done: number; total: number }>();
  for (const r of roundsRes.data || []) {
    const acc = roundsByGroup.get(r.group_id) || { done: 0, total: 0 };
    acc.total += 1;
    if (r.status === "completed" || r.status === "finished" || r.status === "done") {
      acc.done += 1;
    }
    roundsByGroup.set(r.group_id, acc);
  }

  const seasonsByGroup = new Map<string, { done: number; current: string | null }>();
  for (const s of seasonsRes.data || []) {
    const acc = seasonsByGroup.get(s.group_id) || { done: 0, current: null };
    if (s.status === "active" && !acc.current) acc.current = s.name;
    if (s.status === "completed" || s.status === "finished") acc.done += 1;
    seasonsByGroup.set(s.group_id, acc);
  }

  return groups.map((g) => {
    const r = roundsByGroup.get(g.id) || { done: 0, total: 0 };
    const s = seasonsByGroup.get(g.id) || { done: 0, current: null };
    return {
      ...g,
      rounds_done: r.done,
      rounds_total: r.total,
      seasons_done: s.done,
      current_season_name: s.current,
    };
  });
}

export function useMyGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<(Group & { member_count: number; my_role: string | null } & GroupStats)[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setGroups([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const { data: memberships, error: membershipsError } = await supabase
        .from("group_members")
        .select("group_id, role")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (membershipsError) throw membershipsError;

      if (!memberships?.length) {
        setGroups([]);
        return;
      }

      const roleByGroup = new Map(memberships.map((m) => [m.group_id, m.role]));
      const ids = memberships.map((membership) => membership.group_id);
      const { data: groupsData, error: groupsError } = await supabase
        .from("groups")
        .select("*")
        .in("id", ids);

      if (groupsError) throw groupsError;

      const withCounts = await attachMemberCounts(groupsData || []);
      const withStats = await attachGroupStats(withCounts);
      setGroups(withStats.map((g) => ({ ...g, my_role: roleByGroup.get(g.id) || null })));
    } catch (error) {
      console.error("Erro ao carregar meus grupos:", error);
      setGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return { groups, isLoading, refresh };
}

interface PendingGroupCard extends Group {
  member_count: number;
  claimed_player_name?: string | null;
  pending_kind: "join_request" | "claim";
  request_status?: "pending" | "approved" | "rejected";
}

/**
 * Pending approvals tied to the current user.
 * Includes both group join requests and player-link claims.
 * Also surfaces recently resolved (approved/rejected) items for 24h
 * so the user sees the outcome.
 */
export function useMyPendingJoinRequests() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<PendingGroupCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setGroups([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [joinReqsRes, claimReqsRes] = await Promise.all([
        supabase
          .from("group_join_requests")
          .select("group_id, claimed_player_id, status, resolved_at, created_at")
          .eq("user_id", user.id)
          .or(`status.eq.pending,and(status.in.(approved,rejected),resolved_at.gte.${since})`),
        supabase
          .from("player_claims")
          .select("group_id, placeholder_user_id, status, resolved_at, created_at")
          .eq("claimer_user_id", user.id)
          .or(`status.eq.pending,and(status.in.(approved,rejected),resolved_at.gte.${since})`),
      ]);

      if (joinReqsRes.error) throw joinReqsRes.error;
      if (claimReqsRes.error) throw claimReqsRes.error;

      const joinReqs = joinReqsRes.data || [];
      const claimReqs = claimReqsRes.data || [];
      const allGroupIds = [...new Set([...joinReqs.map((r) => r.group_id), ...claimReqs.map((r) => r.group_id)])];

      if (!allGroupIds.length) {
        setGroups([]);
        return;
      }

      const { data: groupsData, error: groupsError } = await supabase
        .from("groups")
        .select("*")
        .in("id", allGroupIds);

      if (groupsError) throw groupsError;

      const withCounts = await attachMemberCounts(groupsData || []);
      const claimedIds = [
        ...joinReqs.map((r) => r.claimed_player_id).filter(Boolean),
        ...claimReqs.map((r) => r.placeholder_user_id).filter(Boolean),
      ] as string[];

      const claimNames: Record<string, string> = {};
      if (claimedIds.length) {
        const { data: profiles, error: profilesError } = await supabase
          .from("user_profiles")
          .select("user_id, name")
          .in("user_id", [...new Set(claimedIds)]);

        if (profilesError) throw profilesError;
        for (const profile of profiles || []) claimNames[profile.user_id] = profile.name;
      }

      const joinReqByGroup = new Map(joinReqs.map((req) => [req.group_id, req]));
      const claimReqByGroup = new Map(claimReqs.map((req) => [req.group_id, req]));

      setGroups(
        withCounts.map((group) => {
          const joinReq = joinReqByGroup.get(group.id);
          const claimReq = claimReqByGroup.get(group.id);
          const claimedPlayerId = joinReq?.claimed_player_id || claimReq?.placeholder_user_id || null;
          const requestStatus = (claimReq?.status || joinReq?.status || "pending") as
            | "pending"
            | "approved"
            | "rejected";

          return {
            ...group,
            claimed_player_name: claimedPlayerId ? claimNames[claimedPlayerId] || null : null,
            pending_kind: claimReq ? "claim" : "join_request",
            request_status: requestStatus,
          };
        }),
      );
    } catch (e) {
      console.error("Erro ao carregar solicitações pendentes:", e);
      setGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh on changes to user's join requests / claims
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`my-pending-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_join_requests", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_claims", filter: `claimer_user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  return { groups, isLoading, refresh };
}

export function usePublicGroups(search: string) {
  const [groups, setGroups] = useState<(Group & { member_count: number; is_premium?: boolean })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);

      try {
        let query = supabase
          .from("groups")
          .select("*")
          .eq("status", "active")
          .neq("visibility", "hidden")
          .order("created_at", { ascending: false })
          .limit(20);

        if (search.trim()) {
          query = query.ilike("name", `%${search.trim()}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        setGroups(await attachMemberCounts(data || []));
      } catch (error) {
        console.error("Erro ao carregar grupos públicos:", error);
        setGroups([]);
      } finally {
        setIsLoading(false);
      }
    };

    const timeout = setTimeout(load, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  return { groups, isLoading };
}

export function useGroupDetail(groupId: string) {
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [members, setMembers] = useState<(GroupMember & { profile?: Tables<"user_profiles"> })[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Tables<"group_join_requests">[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data: currentGroup, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("id", groupId)
        .single();

      if (groupError) throw groupError;

      setGroup(currentGroup);

      if (!currentGroup) {
        setMemberCount(0);
        setMembers([]);
        setMyRole(null);
        setPendingRequests([]);
        return;
      }

      const { data: count } = await supabase.rpc("get_group_member_count", {
        _group_id: groupId,
      });

      setMemberCount(count || 0);

      // Load ALL members (active + removed/left) so ex-members can be shown dimmed.
      // memberCount above already counts only actives via RPC.
      const { data: mems, error: membersError } = await supabase
        .from("group_members")
        .select("*")
        .eq("group_id", groupId);

      if (membersError) throw membersError;

      if (mems?.length) {
        const userIds = mems.map((member) => member.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from("user_profiles")
          .select("*")
          .in("user_id", userIds);

        if (profilesError) throw profilesError;

        const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
        setMembers(mems.map((member) => ({ ...member, profile: profileMap.get(member.user_id) })));
      } else {
        setMembers([]);
      }

      if (user) {
        const me = mems?.find((member) => member.user_id === user.id && member.status === "active");
        setMyRole(me?.role || null);

        const { data: reqs, error: requestsError } = await supabase
          .from("group_join_requests")
          .select("*")
          .eq("group_id", groupId)
          .eq("status", "pending");

        if (requestsError) throw requestsError;

        setPendingRequests(reqs || []);
      } else {
        setMyRole(null);
        setPendingRequests([]);
      }
    } catch (error) {
      console.error("Erro ao carregar detalhes do grupo:", error);
      setGroup(null);
      setMemberCount(0);
      setMembers([]);
      setMyRole(null);
      setPendingRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [groupId, user]);

  useEffect(() => { refresh(); }, [refresh]);

  const isAdmin = myRole === "admin" || myRole === "creator";
  const isCreator = myRole === "creator";

  return { group, memberCount, members, myRole, isAdmin, isCreator, pendingRequests, isLoading, refresh };
}

export async function createGroup(data: {
  name: string;
  description?: string;
  is_public: boolean;
  max_players: number;
  sport: string;
  userId: string;
  match_format?: string;
  singles_group_type?: string;
}) {
  const insertData: any = {
    name: data.name,
    description: data.description || "",
    is_public: data.is_public,
    max_players: data.max_players,
    sport: data.sport,
    created_by: data.userId,
    match_format: data.match_format || "doubles",
  };
  if (data.match_format === "singles" && data.singles_group_type) {
    insertData.singles_group_type = data.singles_group_type;
    insertData.slots_per_round = 2;
  }
  const { data: group, error } = await supabase
    .from("groups")
    .insert(insertData as any)
    .select()
    .single();

  if (error) throw error;

  // Add creator as member
  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: group.id,
    user_id: data.userId,
    role: "creator",
    status: "active",
  });

  if (memberError) {
    await supabase.from("groups").delete().eq("id", group.id);
    throw memberError;
  }

  return group;
}

export async function joinGroup(groupId: string, userId: string, isPublic: boolean) {
  if (isPublic) {
    // Direct join for public groups
    const { error } = await supabase.from("group_members").insert({
      group_id: groupId,
      user_id: userId,
      role: "member",
      status: "active",
    });
    if (error) throw error;
  } else {
    // Request to join for private groups
    const { error } = await supabase.from("group_join_requests").insert({
      group_id: groupId,
      user_id: userId,
      status: "pending",
    });
    if (error) throw error;
  }
}

export async function approveJoinRequest(requestId: string, groupId: string, userId: string, adminId: string) {
  // Capacity check: respect member_limit if set
  const { data: g } = await supabase
    .from("groups")
    .select("member_limit, max_players")
    .eq("id", groupId)
    .maybeSingle();
  const limit = (g as any)?.member_limit ?? null;
  if (limit != null) {
    const { data: cnt } = await supabase.rpc("get_group_member_count", { _group_id: groupId });
    const current = (cnt as number | null) ?? 0;
    if (current >= limit) {
      throw new Error(`Grupo cheio (${current}/${limit} membros). Aumente o limite ou remova membros antes de aprovar.`);
    }
  }

  // Load the request to check if it claims an existing player
  const { data: req } = await supabase
    .from("group_join_requests")
    .select("claimed_player_id, claimed_player_kind")
    .eq("id", requestId)
    .maybeSingle();

  await supabase
    .from("group_join_requests")
    .update({ status: "approved", resolved_by: adminId, resolved_at: new Date().toISOString() })
    .eq("id", requestId);

  const claimedId = (req as any)?.claimed_player_id as string | null;
  if (claimedId) {
    // Merge placeholder/former player history into the new user
    const { error: mergeErr } = await supabase.rpc("merge_placeholder_player", {
      _placeholder_user_id: claimedId,
      _real_user_id: userId,
      _group_id: groupId,
    });
    if (mergeErr) throw mergeErr;
    // merge_placeholder_player already creates/activates the group_members row
    return;
  }

  await supabase.from("group_members").insert({
    group_id: groupId,
    user_id: userId,
    role: "member",
    status: "active",
  });
}

export async function rejectJoinRequest(requestId: string, adminId: string) {
  await supabase
    .from("group_join_requests")
    .update({ status: "rejected", resolved_by: adminId, resolved_at: new Date().toISOString() })
    .eq("id", requestId);
}

export async function removeMember(memberId: string) {
  // Soft-remove: keep group_members row with status='removed' so the original
  // name continues to appear (dimmed) in rankings, matches and history.
  // Load row first so we can audit it (group_id + user_id + role).
  const { data: prev } = await supabase
    .from("group_members")
    .select("group_id, user_id, role, status")
    .eq("id", memberId)
    .maybeSingle();
  const { error } = await supabase
    .from("group_members")
    .update({ status: "removed", updated_at: new Date().toISOString() })
    .eq("id", memberId);
  if (error) throw error;
  if (prev?.group_id) {
    const { logAudit } = await import("@/lib/audit-log");
    await logAudit({
      groupId: prev.group_id,
      action: "member_removed",
      entityType: "group_member",
      entityId: memberId,
      oldData: prev,
      newData: { ...prev, status: "removed" },
    });
  }
}

export async function updateMemberRole(memberId: string, role: string) {
  const { data: prev } = await supabase
    .from("group_members")
    .select("group_id, user_id, role")
    .eq("id", memberId)
    .maybeSingle();
  await supabase.from("group_members").update({ role }).eq("id", memberId);
  // Only log when promotion to admin/creator (the meaningful change for auditors).
  if (prev?.group_id && prev.role !== role && (role === "admin" || role === "creator")) {
    const { logAudit } = await import("@/lib/audit-log");
    await logAudit({
      groupId: prev.group_id,
      action: "member_promoted",
      entityType: "group_member",
      entityId: memberId,
      oldData: { role: prev.role },
      newData: { role },
    });
  }
}

export async function checkUserHasResults(groupId: string, userId: string): Promise<boolean> {
  // Check if user has played any matches in this group
  const { data } = await supabase
    .from("match_players")
    .select("id, match_id, matches!inner(round_id, rounds!inner(group_id))")
    .eq("user_id", userId)
    .eq("matches.rounds.group_id", groupId)
    .limit(1);
  return (data?.length || 0) > 0;
}

export async function leaveGroup(memberId: string) {
  // Set status to 'left' instead of deleting to preserve history
  const { data, error } = await supabase
    .from("group_members")
    .update({ status: "left", updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[leaveGroup] supabase error:", error);
    throw new Error(error.message || "Falha ao sair do grupo");
  }
  if (!data) {
    throw new Error("Não foi possível atualizar o vínculo (verifique permissões).");
  }
}
