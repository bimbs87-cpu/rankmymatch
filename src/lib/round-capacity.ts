import { supabase } from "@/integrations/supabase/client";

/**
 * Compute the maximum number of CONFIRMED players a single round can hold,
 * derived from the group's structural configuration. Anyone confirming beyond
 * this number is automatically pushed to the waiting list.
 *
 * Rules (matches what the user actually configured at group creation):
 *  - Doubles → 4 players per court × simultaneous_courts
 *  - Singles, rivalry group → 2 (always — rivalry is 1v1 only)
 *  - Singles, other → 2 players per court × simultaneous_courts
 *
 * Example: a 2x2 group with 1 court → 4 confirmed slots, the 5th onwards
 * goes straight to the waiting list.
 */
export interface GroupCapacityInputs {
  match_format: string | null;
  simultaneous_courts: number | null;
  singles_group_type?: string | null;
  /** Legacy field — used as a soft upper bound only, never to expand beyond courts. */
  max_players?: number | null;
}

export function computeRoundCapacity(group: GroupCapacityInputs): number {
  const courts = Math.max(1, group.simultaneous_courts ?? 1);
  const isSingles = group.match_format === "singles";

  if (isSingles && group.singles_group_type === "rivalry") {
    return 2;
  }

  const playersPerCourt = isSingles ? 2 : 4;
  const courtCapacity = courts * playersPerCourt;

  // Respect a stricter legacy `max_players` if it's set lower than what the
  // courts allow — but never use it to EXCEED court capacity.
  if (group.max_players && group.max_players >= 2 && group.max_players < courtCapacity) {
    return group.max_players;
  }
  return courtCapacity;
}

/**
 * Fetch the group columns needed for capacity and compute it. Returns null on
 * error (caller should fall back to a safe default).
 */
export async function fetchGroupCapacity(groupId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("groups")
    .select("match_format, simultaneous_courts, singles_group_type, max_players")
    .eq("id", groupId)
    .maybeSingle();
  if (error || !data) return null;
  return computeRoundCapacity(data as GroupCapacityInputs);
}
