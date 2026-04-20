/**
 * Fetches the next scheduled round for a group + the current user's presence
 * status for that round. Used by the GroupsNavMenu and BottomNav to show a
 * "Próxima rodada" shortcut with a presence indicator.
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

export type PresenceStatus = "confirmed" | "declined" | "pending" | "unknown";

export function useNextRound(groupId: string | null | undefined) {
  const [round, setRound] = useState<NextRound | null>(null);
  const [presence, setPresence] = useState<PresenceStatus>("unknown");
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setRound(null);
      setPresence("unknown");
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
        if (cancelled) return;
        const r = (data as NextRound | null) ?? null;
        setRound(r);

        if (r) {
          const { data: auth } = await supabase.auth.getUser();
          const uid = auth.user?.id;
          if (uid) {
            const { data: pres } = await supabase
              .from("round_presence")
              .select("status, confirmed_at")
              .eq("round_id", r.id)
              .eq("user_id", uid)
              .maybeSingle();
            if (cancelled) return;
            const s = (pres?.status as string | undefined) ?? null;
            setConfirmedAt((pres?.confirmed_at as string | null) ?? null);
            if (s === "confirmed") setPresence("confirmed");
            else if (s === "declined" || s === "absent") setPresence("declined");
            else if (s) setPresence("pending");
            else setPresence("pending");
          } else {
            setPresence("unknown");
            setConfirmedAt(null);
          }
        } else {
          setPresence("unknown");
          setConfirmedAt(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return { round, presence, confirmedAt, loading };
}
