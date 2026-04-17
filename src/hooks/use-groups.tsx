import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";

type Group = Tables<"groups">;
type GroupMember = Tables<"group_members">;

async function attachMemberCounts(groups: Group[]) {
  return Promise.all(
    groups.map(async (group) => {
      const { data: count } = await supabase.rpc("get_group_member_count", {
        _group_id: group.id,
      });

      return { ...group, member_count: count || 0 };
    })
  );
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
  const [groups, setGroups] = useState<(Group & { member_count: number } & GroupStats)[]>([]);
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
        .select("group_id")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (membershipsError) throw membershipsError;

      if (!memberships?.length) {
        setGroups([]);
        return;
      }

      const ids = memberships.map((membership) => membership.group_id);
      const { data: groupsData, error: groupsError } = await supabase
        .from("groups")
        .select("*")
        .in("id", ids);

      if (groupsError) throw groupsError;

      const withCounts = await attachMemberCounts(groupsData || []);
      const withStats = await attachGroupStats(withCounts);
      setGroups(withStats);
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

export function usePublicGroups(search: string) {
  const [groups, setGroups] = useState<(Group & { member_count: number })[]>([]);
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
  const { error } = await supabase
    .from("group_members")
    .update({ status: "removed", updated_at: new Date().toISOString() })
    .eq("id", memberId);
  if (error) throw error;
}

export async function updateMemberRole(memberId: string, role: string) {
  await supabase.from("group_members").update({ role }).eq("id", memberId);
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
  const { error } = await supabase
    .from("group_members")
    .update({ status: "left", updated_at: new Date().toISOString() })
    .eq("id", memberId);
  if (error) throw error;
}
