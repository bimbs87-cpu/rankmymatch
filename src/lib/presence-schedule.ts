/**
 * Utility to determine when the presence confirmation list opens for a round,
 * based on the group's presence_open_mode and presence_open_time settings.
 */

export interface PresenceConfig {
  presence_open_mode: string; // 'always' | 'same_day' | '1_day_before' | '2_days_before' | 'random'
  presence_open_time: string; // e.g. '10:00:00'
}

/**
 * Returns the Date at which the presence list opens, or null if always open.
 * For 'random' mode, uses a deterministic seed based on roundId to pick a time
 * in the 36h–24h window before the game.
 */
export function getPresenceOpenDate(
  config: PresenceConfig,
  scheduledDate: string | null,
  scheduledTime: string | null,
  roundId?: string
): Date | null {
  if (config.presence_open_mode === "always" || !scheduledDate) return null;

  // Game datetime
  const gameTime = scheduledTime ? scheduledTime.slice(0, 5) : "00:00";
  const gameDate = new Date(`${scheduledDate}T${gameTime}:00`);

  if (config.presence_open_mode === "random") {
    // Deterministic pseudo-random based on roundId
    const seed = roundId ? hashCode(roundId) : 0;
    // Random offset between 24h and 36h before game (in minutes)
    const minMinutes = 24 * 60;
    const maxMinutes = 36 * 60;
    const range = maxMinutes - minMinutes; // 720 minutes = 12h window
    const offsetMinutes = minMinutes + (Math.abs(seed) % range);
    return new Date(gameDate.getTime() - offsetMinutes * 60 * 1000);
  }

  // For fixed modes, calculate days before and use presence_open_time
  let daysBefore = 0;
  switch (config.presence_open_mode) {
    case "same_day":
      daysBefore = 0;
      break;
    case "1_day_before":
      daysBefore = 1;
      break;
    case "2_days_before":
      daysBefore = 2;
      break;
    default:
      daysBefore = 1;
  }

  const openTime = config.presence_open_time?.slice(0, 5) || "10:00";
  const openDate = new Date(`${scheduledDate}T${openTime}:00`);
  openDate.setDate(openDate.getDate() - daysBefore);
  return openDate;
}

/**
 * Returns true if the presence list is currently open.
 */
export function isPresenceOpen(
  config: PresenceConfig,
  scheduledDate: string | null,
  scheduledTime: string | null,
  roundId?: string
): boolean {
  const openDate = getPresenceOpenDate(config, scheduledDate, scheduledTime, roundId);
  if (!openDate) return true; // 'always' mode or no scheduled date
  return new Date() >= openDate;
}

/**
 * Simple hash function for deterministic randomness from a string.
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return hash;
}

/**
 * Format the opening date/time for display.
 */
export function formatPresenceOpenDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }) + " às " + date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
