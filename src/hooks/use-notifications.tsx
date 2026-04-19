import { useState, useEffect, useCallback, useRef } from "react";
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
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const items = data || [];
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.read).length);
    } catch (error) {
      console.error("Erro ao carregar notificações:", error);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notif-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refreshRef.current();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const markAllRead = useCallback(async () => {
    if (!user) return;

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    await refresh();
  }, [user, refresh]);

  const markRead = useCallback(
    async (id: string) => {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
      await refresh();
    },
    [refresh]
  );

  return { notifications, unreadCount, isLoading, refresh, markAllRead, markRead };
}

/**
 * Notify all members of a group except the actor (in-app + best-effort push).
 */
export async function notifyGroupMembers(params: {
  groupId: string;
  actorId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null>;
  /** Optional URL to open when the push is tapped. Defaults to "/notifications". */
  url?: string;
}) {
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", params.groupId)
    .eq("status", "active")
    .neq("user_id", params.actorId);

  if (!members?.length) return;

  const userIds = members.map((m) => m.user_id);
  const rows = userIds.map((uid) => ({
    user_id: uid,
    group_id: params.groupId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data || {},
  }));

  await supabase.from("notifications").insert(rows);

  // Fire-and-forget push (best-effort, never blocks the in-app notification).
  try {
    const { sendPushFn } = await import("@/lib/push.functions");
    void sendPushFn({
      data: {
        userIds,
        payload: {
          title: params.title,
          body: params.body,
          url: params.url || "/notifications",
          type: params.type,
          tag: `${params.type}:${params.groupId}`,
          data: { groupId: params.groupId, ...(params.data || {}) },
        },
      },
    }).catch(() => {});
  } catch {
    /* push is optional */
  }
}
