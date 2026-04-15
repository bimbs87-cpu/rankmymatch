import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";

type Group = Tables<"groups">;
type GroupMember = Tables<"group_members">;

export function useMyGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<(Group & { member_count: number })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setGroups([]); setIsLoading(false); return; }
    setIsLoading(true);
    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (!memberships?.length) { setGroups([]); setIsLoading(false); return; }

    const ids = memberships.map((m) => m.group_id);
    const { data: groupsData } = await supabase
      .from("groups")
      .select("*")
      .in("id", ids);

    // get member counts
    const withCounts = await Promise.all(
      (groupsData || []).map(async (g) => {
        const { count } = await supabase
          .from("group_members")
          .select("*", { count: "exact", head: true })
          .eq("group_id", g.id)
          .eq("status", "active");
        return { ...g, member_count: count || 0 };
      })
    );

    setGroups(withCounts);
    setIsLoading(false);
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
      let query = supabase
        .from("groups")
        .select("*")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(20);

      if (search.trim()) {
        query = query.ilike("name", `%${search.trim()}%`);
      }

      const { data } = await query;

      const withCounts = await Promise.all(
        (data || []).map(async (g) => {
          const { count } = await supabase
            .from("group_members")
            .select("*", { count: "exact", head: true })
            .eq("group_id", g.id)
            .eq("status", "active");
          return { ...g, member_count: count || 0 };
        })
      );

      setGroups(withCounts);
      setIsLoading(false);
    };

    const timeout = setTimeout(load, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  return { groups, isLoading };
}

export function useGroupDetail(groupId: string) {
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<(GroupMember & { profile?: Tables<"user_profiles"> })[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Tables<"group_join_requests">[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);

    const { data: g } = await supabase
      .from("groups")
      .select("*")
      .eq("id", groupId)
      .single();
    setGroup(g);

    if (!g) { setIsLoading(false); return; }

    // Members with profiles
    const { data: mems } = await supabase
      .from("group_members")
      .select("*")
      .eq("group_id", groupId)
      .eq("status", "active");

    if (mems?.length) {
      const userIds = mems.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("*")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      setMembers(mems.map((m) => ({ ...m, profile: profileMap.get(m.user_id) })));
    } else {
      setMembers([]);
    }

    // My role
    if (user) {
      const me = mems?.find((m) => m.user_id === user.id);
      setMyRole(me?.role || null);
    }

    // Pending requests (if admin)
    if (user) {
      const { data: reqs } = await supabase
        .from("group_join_requests")
        .select("*")
        .eq("group_id", groupId)
        .eq("status", "pending");
      setPendingRequests(reqs || []);
    }

    setIsLoading(false);
  }, [groupId, user]);

  useEffect(() => { refresh(); }, [refresh]);

  const isAdmin = myRole === "admin" || myRole === "creator";
  const isCreator = myRole === "creator";

  return { group, members, myRole, isAdmin, isCreator, pendingRequests, isLoading, refresh };
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
  await supabase.from("group_members").insert({
    group_id: group.id,
    user_id: data.userId,
    role: "creator",
    status: "active",
  });

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
