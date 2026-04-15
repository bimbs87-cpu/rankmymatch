export const WEEKDAYS = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

export function getWeeklyDates(dayOfWeek: number, count: number, startFrom?: string): string[] {
  const dates: string[] = [];
  const start = startFrom ? new Date(startFrom + "T00:00:00") : new Date();
  const current = new Date(start);
  const diff = (dayOfWeek - current.getDay() + 7) % 7;
  if (diff !== 0) {
    current.setDate(current.getDate() + diff);
  } else if (!startFrom && current.getHours() >= 12) {
    current.setDate(current.getDate() + 7);
  }
  for (let i = 0; i < count; i++) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 7);
  }
  return dates;
}

export function getMonthlyDates(count: number, startFrom?: string): string[] {
  const dates: string[] = [];
  const start = startFrom ? new Date(startFrom + "T00:00:00") : new Date();
  for (let i = 0; i < count; i++) {
    const mid = new Date(start.getFullYear(), start.getMonth() + i, 15);
    dates.push(mid.toISOString().split("T")[0]);
  }
  return dates;
}

export function formatDateBR(d: string): string {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
