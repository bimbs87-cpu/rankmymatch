/**
 * Format a future date/time as a short, human Portuguese countdown.
 *
 * Examples:
 *   - "agora"      (≤ 2 minutes from now or in the past, but same-day)
 *   - "em 35min"   (< 1h)
 *   - "em 3h"      (< 24h, same day or next day morning)
 *   - "amanhã"     (calendar day = today + 1)
 *   - "em 2 dias"  (< 7 days)
 *   - "em 2 sem"   (< 30 days)
 *   - "em 1 mês"   (≥ 30 days)
 *
 * Returns null when:
 *   - the date is in the past (and not today)
 *   - the input is missing/invalid
 *
 * `time` is optional ("HH:MM:SS" or "HH:MM"); when omitted we anchor to start of day.
 */
export function formatCountdown(
  scheduledDate: string | null | undefined,
  scheduledTime?: string | null,
  now: Date = new Date(),
): string | null {
  if (!scheduledDate) return null;

  const timePart = scheduledTime ? scheduledTime.slice(0, 8).padEnd(8, ":00").replace(/:$/, "") : "00:00:00";
  const target = new Date(`${scheduledDate}T${timePart.length === 5 ? `${timePart}:00` : timePart}`);
  if (Number.isNaN(target.getTime())) return null;

  const diffMs = target.getTime() - now.getTime();

  // Calendar day diff (ignores time, in local TZ)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const dayDiff = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000));

  // Past
  if (dayDiff < 0) return null;
  if (dayDiff === 0 && diffMs < -2 * 60 * 1000) return null;

  // Same calendar day
  if (dayDiff === 0) {
    if (diffMs <= 2 * 60 * 1000) return "agora";
    const minutes = Math.round(diffMs / 60000);
    if (minutes < 60) return `em ${minutes}min`;
    const hours = Math.round(minutes / 60);
    return `em ${hours}h`;
  }

  if (dayDiff === 1) return "amanhã";
  if (dayDiff < 7) return `em ${dayDiff} dias`;
  if (dayDiff < 30) {
    const weeks = Math.round(dayDiff / 7);
    return weeks === 1 ? "em 1 sem" : `em ${weeks} sem`;
  }
  const months = Math.round(dayDiff / 30);
  return months === 1 ? "em 1 mês" : `em ${months} meses`;
}

/**
 * Tone helper for the countdown — used to pick a color tier visually.
 * - "now": within an hour or already same-day soon
 * - "soon": today (>1h) or tomorrow
 * - "near": within a week
 * - "far": further out
 */
export function countdownTone(
  scheduledDate: string | null | undefined,
  scheduledTime?: string | null,
  now: Date = new Date(),
): "now" | "soon" | "near" | "far" | null {
  const label = formatCountdown(scheduledDate, scheduledTime, now);
  if (!label) return null;
  if (label === "agora" || label.endsWith("min") || label === "em 1h") return "now";
  if (label === "amanhã" || (label.startsWith("em ") && label.endsWith("h"))) return "soon";
  if (label.endsWith("dias")) return "near";
  return "far";
}
