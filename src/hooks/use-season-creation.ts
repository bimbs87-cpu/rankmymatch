import { supabase } from "@/integrations/supabase/client";
import { notifyGroupMembers } from "@/hooks/use-notifications";

export async function createSeasonWithRounds(data: {
  groupId: string;
  name: string;
  userId: string;
  durationType: string;
  totalRounds: number;
  roundDates: string[];
  scheduledTime?: string;
  matchFormat?: string;
}) {
  // Create season
  console.log("[createSeasonWithRounds] Starting with data:", JSON.stringify(data));
  const { data: season, error } = await supabase
    .from("seasons")
    .insert({
      group_id: data.groupId,
      name: data.name,
      created_by: data.userId,
      match_format: data.matchFormat || "2v2",
      total_rounds: data.totalRounds,
      duration_type: data.durationType,
      status: "active",
    })
    .select()
    .single();
  console.log("[createSeasonWithRounds] Season result:", { season, error });
  if (error) throw new Error(`Erro ao criar temporada: ${error.message}`);
  if (!season) throw new Error("Temporada não retornada após insert");

  // Create all rounds at once
  const roundInserts = data.roundDates.map((date, idx) => ({
    group_id: data.groupId,
    season_id: season.id,
    round_number: idx + 1,
    scheduled_date: date,
    scheduled_time: data.scheduledTime || null,
    max_players: 8,
    status: "scheduled" as const,
  }));

  if (roundInserts.length > 0) {
    const { error: roundError } = await supabase
      .from("rounds")
      .insert(roundInserts);
    if (roundError) throw roundError;
  }

  // Notify group
  notifyGroupMembers({
    groupId: data.groupId,
    actorId: data.userId,
    type: "season_created",
    title: "Nova temporada! 🏆",
    body: `${data.name} foi criada com ${data.totalRounds} rodadas. Bora jogar!`,
    data: { seasonId: season.id },
  });

  return season;
}
