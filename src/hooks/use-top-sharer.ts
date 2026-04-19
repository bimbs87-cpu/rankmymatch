/**
 * Returns the current week's #1 sharer for a group (by share-event count).
 * "Week" = last 7 days. Returns null when there are no events yet.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TopSharer {
  user_id: string;
  count: number;
  name: string;
  avatar_url: string | null;
}

export function useTopSharer(groupId: string | undefined) {
  const [data, setData] = useState<TopSharer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: events } = await supabase
          .from("group_share_events")
          .select("user_id")
          .eq("group_id", groupId)
          .gte("created_at", since)
          .not("user_id", "is", null);

        const counts = new Map<string, number>();
        for (const e of events || []) {
          if (!e.user_id) continue;
          counts.set(e.user_id, (counts.get(e.user_id) || 0) + 1);
        }
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        const top = sorted[0];
        if (!top) {
          if (!cancelled) setData(null);
          return;
        }
        const { data: prof } = await supabase
          .from("user_profiles")
          .select("user_id, name, nickname, avatar_url")
          .eq("user_id", top[0])
          .maybeSingle();
        if (cancelled) return;
        setData({
          user_id: top[0],
          count: top[1],
          name: prof?.nickname || prof?.name || "Membro",
          avatar_url: prof?.avatar_url ?? null,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  return { data, loading };
}
