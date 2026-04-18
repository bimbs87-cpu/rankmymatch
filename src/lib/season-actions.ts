import { supabase } from "@/integrations/supabase/client";

function normalizeSeasonMatchFormat(format?: string) {
  return format === "singles" || format === "1v1" ? "1v1" : "2v2";
}

export async function createSeason(data: {
  groupId: string;
  name: string;
  userId: string;
  matchFormat?: string;
  totalRounds?: number;
}) {
  const { data: season, error } = await supabase
    .from("seasons")
    .insert({
      group_id: data.groupId,
      name: data.name,
      created_by: data.userId,
      match_format: normalizeSeasonMatchFormat(data.matchFormat),
      total_rounds: data.totalRounds || null,
      status: "active",
    })
    .select()
    .single();
  if (error) throw error;
  return season;
}
