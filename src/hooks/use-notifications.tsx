import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";

type Notification = Tables<"notifications">;

const ROUND_LIFECYCLE_TYPES = new Set([
  "round_created",
  "round_open",
  "round_urgent",
  "round_reminder",
  "round_nudge",
]);

function getRoundLifecycleKey(notification: Notification): string | null {
  if (!ROUND_LIFECYCLE_TYPES.has(notification.type)) return null;

  const data = (notification.data || {}) as {
    roundId?: string;
    round_id?: string;
    groupId?: string;
    group_id?: string;
  };

  const roundId = data.roundId || data.round_id;
  const groupId = notification.group_id || data.groupId || data.group_id || "global";

  return roundId ? `${groupId}:${roundId}` : null;
}

function dedupeNotifications(items: Notification[]) {
  const seen = new Set<string>();

  return items.filter((notification) => {
    const roundKey = getRoundLifecycleKey(notification);
    if (!roundKey) return true;

    const dedupeKey = `round-lifecycle:${roundKey}`;
    if (seen.has(dedupeKey)) return false;

    seen.add(dedupeKey);
    return true;
  });
}

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

      const items = dedupeNotifications(data || []);
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

// Re-export fan-out helpers (moved to src/lib/notify.ts) so existing import
// paths keep working. New code should import directly from "@/lib/notify".
export { notifyGroupAdmins, notifyGroupMembers } from "@/lib/notify";

