import { supabase } from "@/integrations/supabase/client";

export type RetroactiveSpacing = "fixed_weekday" | "evenly";

export interface RetroactiveSeasonInput {
  groupId: string;
  userId: string;
  matchFormat: "doubles" | "singles";
  singlesGroupType?: "rivalry" | "league" | "casual" | null;
  simultaneousCourts?: number;
  maxPlayers?: number;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  totalRounds: number;
  spacing: RetroactiveSpacing;
  fixedWeekday?: number; // 0=Sun..6=Sat, only for "fixed_weekday"
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function generateRetroactiveDates(
  startDate: string,
  endDate: string,
  totalRounds: number,
  spacing: RetroactiveSpacing,
  fixedWeekday?: number,
): string[] {
  if (totalRounds <= 0) return [];
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  if (end < start) return [];

  if (spacing === "fixed_weekday" && typeof fixedWeekday === "number") {
    // Find all dates within [start,end] matching fixedWeekday
    const matches: Date[] = [];
    const cursor = new Date(start);
    // advance to first matching weekday
    while (cursor.getDay() !== fixedWeekday && cursor <= end) {
      cursor.setDate(cursor.getDate() + 1);
    }
    while (cursor <= end) {
      matches.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    if (matches.length >= totalRounds) {
      // Pick evenly across the matches
      const step = matches.length / totalRounds;
      const picks: string[] = [];
      for (let i = 0; i < totalRounds; i++) {
        picks.push(toISODate(matches[Math.floor(i * step)]));
      }
      return picks;
    }
    // Fallback: not enough matching weekdays — fall through to even spread
  }

  // Evenly distribute across the interval (inclusive)
  const totalDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
  const dates: string[] = [];
  if (totalRounds === 1) {
    dates.push(toISODate(start));
    return dates;
  }
  for (let i = 0; i < totalRounds; i++) {
    const offset = Math.round((i * totalDays) / (totalRounds - 1));
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    dates.push(toISODate(d));
  }
  return dates;
}

export async function createRetroactiveSeason(input: RetroactiveSeasonInput) {
  const dates = generateRetroactiveDates(
    input.startDate,
    input.endDate,
    input.totalRounds,
    input.spacing,
    input.fixedWeekday,
  );
  if (!dates.length) throw new Error("Não foi possível gerar as datas das rodadas.");

  const isSingles = input.matchFormat === "singles";
  const seasonMatchFormat = isSingles ? "1v1" : "2v2";

  // Determine status: finished if end date is in the past, otherwise active
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endD = parseISODate(input.endDate);
  const isFinished = endD < today;

  // Round sizing
  let maxPlayersPerRound = 4;
  if (isSingles) {
    if (input.singlesGroupType === "rivalry") maxPlayersPerRound = 2;
    else maxPlayersPerRound = input.maxPlayers && input.maxPlayers >= 2 ? input.maxPlayers : 8;
  } else {
    const courts = input.simultaneousCourts && input.simultaneousCourts >= 1 ? input.simultaneousCourts : 1;
    maxPlayersPerRound = courts * 4;
  }

  const { data: season, error: seasonError } = await supabase
    .from("seasons")
    .insert({
      group_id: input.groupId,
      name: input.name,
      created_by: input.userId,
      match_format: seasonMatchFormat,
      total_rounds: input.totalRounds,
      duration_type: "custom",
      status: isFinished ? "finished" : "active",
      start_date: input.startDate,
      end_date: input.endDate,
    } as any)
    .select()
    .single();

  if (seasonError) throw new Error(`Erro ao criar temporada: ${seasonError.message}`);
  if (!season) throw new Error("Temporada não retornada após a criação.");

  const roundInserts = dates.map((date, idx) => {
    const d = parseISODate(date);
    d.setHours(0, 0, 0, 0);
    const isPast = d < today;
    return {
      group_id: input.groupId,
      season_id: season.id,
      round_number: idx + 1,
      scheduled_date: date,
      scheduled_time: null,
      max_players: maxPlayersPerRound,
      match_format: isSingles ? "singles" : "doubles",
      status: isPast ? "completed" : "scheduled",
    };
  });

  const { error: roundError } = await supabase.from("rounds").insert(roundInserts as any);
  if (roundError) {
    // Rollback season
    await supabase.from("seasons").delete().eq("id", season.id);
    throw new Error(`Erro ao criar rodadas: ${roundError.message}`);
  }

  return season;
}
