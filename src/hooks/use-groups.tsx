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

export function useMyGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<(Group & { member_count: number })[]>([]);
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

      setGroups(await attachMemberCounts(groupsData || []));
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
          .eq("is_public", true)
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

      const { data: mems, error: membersError } = await supabase
        .from("group_members")
        .select("*")
        .eq("group_id", groupId)
        .eq("status", "active");

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
        const me = mems?.find((member) => member.user_id === user.id);
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
}) {
  const { data: group, error } = await supabase
    .from("groups")
    .insert({
      name: data.name,
      description: data.description || "",
      is_public: data.is_public,
      max_players: data.max_players,
      sport: data.sport,
      created_by: data.userId,
    })
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
  await supabase
    .from("group_join_requests")
    .update({ status: "approved", resolved_by: adminId, resolved_at: new Date().toISOString() })
    .eq("id", requestId);

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
  await supabase.from("group_members").delete().eq("id", memberId);
}

export async function updateMemberRole(memberId: string, role: string) {
  await supabase.from("group_members").update({ role }).eq("id", memberId);
}
