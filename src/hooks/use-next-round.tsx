/**
 * Fetches the next scheduled round (status='scheduled', date >= today) for a
 * given group, ordered by scheduled_date + scheduled_time ASC.
 * Used by the GroupsNavMenu to show a "Próxima rodada" shortcut.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NextRound {
  id: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  season_id: string | null;
  location: string | null;
}

export function useNextRound(groupId: string | null | undefined) {
  const [round, setRound] = useState<NextRound | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setRound(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
          .from("rounds")
          .select("id, scheduled_date, scheduled_time, season_id, location")
          .eq("group_id", groupId)
          .eq("status", "scheduled")
          .gte("scheduled_date", today)
          .order("scheduled_date", { ascending: true })
          .order("scheduled_time", { ascending: true, nullsFirst: true })
          .limit(1)
          .maybeSingle();
        if (!cancelled) setRound((data as NextRound | null) ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return { round, loading };
}
