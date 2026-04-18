import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Season = Tables<"seasons">;

export function useGroupSeasons(groupId: string) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("seasons")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });
    setSeasons(data || []);
    setIsLoading(false);
  }, [groupId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { seasons, isLoading, refresh };
}

// Re-exports for backwards compatibility — existing imports from
// "@/hooks/use-seasons" continue to work after the refactor.
export { useSeasonRounds, useRoundDetail } from "@/hooks/use-rounds";
export { createSeason } from "@/lib/season-actions";
export {
  createRound,
  confirmPresence,
  cancelPresence,
  drawTeams,
  deleteMatch,
  deleteRound,
} from "@/lib/round-actions";
