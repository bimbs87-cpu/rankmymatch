import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";

type Notification = Tables<"notifications">;

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const items = data || [];
    setNotifications(items);
    setUnreadCount(items.filter((n) => !n.read).length);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    refresh();
  }, [user, refresh]);

  const markRead = useCallback(
    async (id: string) => {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
      refresh();
    },
    [refresh]
  );

  return { notifications, unreadCount, isLoading, refresh, markAllRead, markRead };
}

/**
 * Notify all members of a group except the actor.
 */
export async function notifyGroupMembers(params: {
  groupId: string;
  actorId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  // Get all active members except the actor
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", params.groupId)
    .eq("status", "active")
    .neq("user_id", params.actorId);

  if (!members?.length) return;

  const rows = members.map((m) => ({
    user_id: m.user_id,
    group_id: params.groupId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data || {},
  }));

  await supabase.from("notifications").insert(rows);
}
