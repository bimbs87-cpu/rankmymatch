/** A reschedule changes only the date of the existing round, never its games. */
export function roundDateUpdate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Selecione uma data válida");
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Selecione uma data válida");
  }
  return { scheduled_date: date };
}

export function canChangeRoundDate(status: string | null) {
  return status === "scheduled" || status === "in_progress";
}