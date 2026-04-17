import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a Set of user_ids that are currently active members of the given group.
 * Useful to dim/flag former members ("ex-membros") in rankings, matches, presence
 * lists and history, while still showing their original profile name.
 */
export function useGroupActiveUserIds(groupId: string | undefined) {
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!groupId) {
      setActiveIds(new Set());
      setLoaded(true);
      return;
    }
    setLoaded(false);
    (async () => {
      const { data } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .eq("status", "active");
      if (cancelled) return;
      setActiveIds(new Set((data || []).map((m) => m.user_id)));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const isActive = (userId: string | null | undefined) =>
    !userId ? false : !loaded ? true : activeIds.has(userId);
  const isFormer = (userId: string | null | undefined) =>
    !userId ? false : loaded && !activeIds.has(userId);

  return { activeIds, isActive, isFormer, loaded };
}
