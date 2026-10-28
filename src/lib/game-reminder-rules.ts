export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
export type ReminderKind = "round_open" | "presence_day_before" | "round_urgent" | "result_after_game" | "result_next_day" | "previous_round_pending";
export function gameTime(date: string, time: string | null): number {
  return Date.parse(`${date}T${(time || "00:00").slice(0, 5)}:00-03:00`);
}
export function localDate(time: number): string {
  return new Date(time - 3 * 60 * MINUTE).toISOString().slice(0, 10);
}
export function reminderKinds(now: number, start: number, open: number, hasVisited: boolean): ReminderKind[] {
  const result: ReminderKind[] = [];
  if (now < start && now >= open) {
    result.push("round_open");
    if (now >= start - DAY) result.push("presence_day_before");
    if (now >= start - 2 * 60 * MINUTE) result.push("round_urgent");
  }
  if (!hasVisited && now >= start + 90 * MINUTE && now < start + DAY) result.push("result_after_game");
  if (!hasVisited && now >= start + DAY && now < start + 2 * DAY) result.push("result_next_day");
  return result;
}
export function presenceOpening(date: string, time: string | null, id: string, mode: string, openTime: string, force: string | null): number {
  if (force) return Date.parse(force);
  const start = gameTime(date, time);
  if (mode === "always") return start - DAY;
  if (mode === "random") {
    let hash = 0;
    for (const character of id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    return start - (1440 + Math.abs(hash) % 720) * MINUTE;
  }
  const days = mode === "same_day" ? 0 : mode === "2_days_before" ? 2 : 1;
  return gameTime(date, openTime) - days * DAY;
}