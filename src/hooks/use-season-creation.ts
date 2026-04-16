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
  setsPerMatch?: number;
  singlesPairingMode?: string;
  oddPlayerRule?: string;
}) {
  if (!data.roundDates.length) {
    throw new Error("Defina pelo menos uma data para criar a temporada.");
  }

  let createdSeasonId: string | null = null;

  try {
    const insertData: any = {
      group_id: data.groupId,
      name: data.name,
      created_by: data.userId,
      match_format: data.matchFormat || "2v2",
      total_rounds: data.totalRounds,
      duration_type: data.durationType,
      status: "active",
    };
    if (data.setsPerMatch != null) insertData.sets_per_match = data.setsPerMatch;
    if (data.singlesPairingMode) insertData.singles_pairing_mode = data.singlesPairingMode;
    if (data.oddPlayerRule) insertData.odd_player_rule = data.oddPlayerRule;

    const { data: season, error } = await supabase
      .from("seasons")
      .insert(insertData as any)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao criar temporada: ${error.message}`);
    }

    if (!season) {
      throw new Error("Temporada não retornada após a criação.");
    }

    createdSeasonId = season.id;

    const isSingles = data.matchFormat === "singles";
    const roundInserts = data.roundDates.map((date, idx) => ({
      group_id: data.groupId,
      season_id: season.id,
      round_number: idx + 1,
      scheduled_date: date,
      scheduled_time: data.scheduledTime || null,
      max_players: isSingles ? 2 : 8,
      match_format: isSingles ? "singles" : "doubles",
      status: "scheduled" as const,
    }));

    const { error: roundError } = await supabase.from("rounds").insert(roundInserts);

    if (roundError) {
      throw new Error(`Erro ao criar rodadas: ${roundError.message}`);
    }

    try {
      await notifyGroupMembers({
        groupId: data.groupId,
        actorId: data.userId,
        type: "season_created",
        title: "Nova temporada! 🏆",
        body: `${data.name} foi criada com ${data.totalRounds} rodadas. Bora jogar!`,
        data: { seasonId: season.id },
      });
    } catch (notificationError) {
      console.error("[createSeasonWithRounds] Falha ao notificar grupo:", notificationError);
    }

    return season;
  } catch (error) {
    if (createdSeasonId) {
      const { error: rollbackError } = await supabase
        .from("seasons")
        .delete()
        .eq("id", createdSeasonId);

      if (rollbackError) {
        console.error("[createSeasonWithRounds] Falha no rollback da temporada:", rollbackError);
      }
    }

    console.error("[createSeasonWithRounds] Falha na criação:", error);
    throw error instanceof Error
      ? error
      : new Error("Não foi possível criar a temporada. Tente novamente.");
  }
}
