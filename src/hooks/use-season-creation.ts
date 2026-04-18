import { supabase } from "@/integrations/supabase/client";
import { notifyGroupMembers } from "@/hooks/use-notifications";

function normalizeSeasonMatchFormat(format?: string) {
  return format === "singles" || format === "1v1" ? "1v1" : "2v2";
}

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
  setsMode?: "fixed" | "flexible" | "unlimited";
  singlesPairingMode?: string;
  oddPlayerRule?: string;
}) {
  if (!data.roundDates.length) {
    throw new Error("Defina pelo menos uma data para criar a temporada.");
  }

  let createdSeasonId: string | null = null;

  try {
    const normalizedSeasonMatchFormat = normalizeSeasonMatchFormat(data.matchFormat);
    const isSingles = normalizedSeasonMatchFormat === "1v1";

    // Singles round sizing:
    // - rivalry: 2 players
    // - league/casual: group's configured max_players (fallback 8)
    let singlesMaxPlayers = 8;
    if (isSingles) {
      const { data: groupRow } = await supabase
        .from("groups")
        .select("singles_group_type, max_players")
        .eq("id", data.groupId)
        .single();
      if (groupRow?.singles_group_type === "rivalry") {
        singlesMaxPlayers = 2;
      } else {
        singlesMaxPlayers = groupRow?.max_players && groupRow.max_players >= 2
          ? groupRow.max_players
          : 8;
      }
    }

    const insertData: any = {
      group_id: data.groupId,
      name: data.name,
      created_by: data.userId,
      match_format: normalizedSeasonMatchFormat,
      total_rounds: data.totalRounds,
      duration_type: data.durationType,
      status: "active",
    };
    if (data.setsPerMatch != null) insertData.sets_per_match = data.setsPerMatch;
    if (data.setsMode) insertData.sets_mode = data.setsMode;
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

    const roundInserts = data.roundDates.map((date, idx) => ({
      group_id: data.groupId,
      season_id: season.id,
      round_number: idx + 1,
      scheduled_date: date,
      scheduled_time: data.scheduledTime || null,
      max_players: isSingles ? singlesMaxPlayers : 8,
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
