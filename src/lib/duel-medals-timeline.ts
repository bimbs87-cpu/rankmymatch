/**
 * Duel medals timeline — replays the H2H history match-by-match (chronologically)
 * and detects every change of holder for each of the 6 medals. This produces a
 * "conquistas do duelo" log that the UI can render as a timeline.
 */

import { computeDuelMedals, type MedalMatchInput, type DuelMedals } from "./duel-medals";

export type MedalKey =
  | "carrasco"
  | "invicto"
  | "reiDaVirada"
  | "fregues"
  | "mestreDosSets"
  | "peQuente";

export interface MedalTimelineEvent {
  matchIndex: number; // chronological index (1 = first match)
  date: string | null;
  medal: MedalKey;
  medalLabel: string;
  medalEmoji: string;
  newHolder: "A" | "B" | null;
  previousHolder: "A" | "B" | null;
  value: number;
}

export interface MedalCurrentSummary {
  key: MedalKey;
  label: string;
  emoji: string;
  holder: "A" | "B" | null;
  hint: string;
  value: number;
}

const MEDAL_META: Record<MedalKey, { label: string; emoji: string }> = {
  carrasco: { label: "Carrasco", emoji: "🗡️" },
  invicto: { label: "Invicto", emoji: "🛡️" },
  reiDaVirada: { label: "Rei da virada", emoji: "👑" },
  fregues: { label: "Freguês", emoji: "🎯" },
  mestreDosSets: { label: "Mestre dos sets", emoji: "🎾" },
  peQuente: { label: "Pé quente", emoji: "🔥" },
};

const ALL_KEYS: MedalKey[] = [
  "carrasco",
  "invicto",
  "reiDaVirada",
  "fregues",
  "mestreDosSets",
  "peQuente",
];

export interface TimelineMatchInput extends MedalMatchInput {
  date: string | null;
}

/**
 * @param matchesNewestFirst  H2H matches as stored in the page (newest-first).
 */
export function buildMedalsTimeline(
  matchesNewestFirst: TimelineMatchInput[],
  playerAId: string,
  playerBId: string,
): { events: MedalTimelineEvent[]; current: MedalCurrentSummary[] } {
  // Replay chronologically (oldest -> newest).
  const chrono = [...matchesNewestFirst].reverse();
  const events: MedalTimelineEvent[] = [];
  const lastHolder: Record<MedalKey, "A" | "B" | null> = {
    carrasco: null,
    invicto: null,
    reiDaVirada: null,
    fregues: null,
    mestreDosSets: null,
    peQuente: null,
  };

  let lastSnapshot: DuelMedals | null = null;

  for (let i = 0; i < chrono.length; i++) {
    // computeDuelMedals expects newest-first → pass slice(0..i) reversed.
    const upToHere = chrono.slice(0, i + 1).reverse();
    const snapshot = computeDuelMedals(upToHere, playerAId, playerBId);
    lastSnapshot = snapshot;

    for (const key of ALL_KEYS) {
      const newHolder = snapshot[key].holder;
      const prevHolder = lastHolder[key];
      if (newHolder !== prevHolder && newHolder !== null) {
        events.push({
          matchIndex: i + 1,
          date: chrono[i].date,
          medal: key,
          medalLabel: MEDAL_META[key].label,
          medalEmoji: MEDAL_META[key].emoji,
          newHolder,
          previousHolder: prevHolder,
          value: snapshot[key].value,
        });
      }
      lastHolder[key] = newHolder;
    }
  }

  const current: MedalCurrentSummary[] = ALL_KEYS.map((key) => ({
    key,
    label: MEDAL_META[key].label,
    emoji: MEDAL_META[key].emoji,
    holder: lastSnapshot ? lastSnapshot[key].holder : null,
    hint: lastSnapshot ? lastSnapshot[key].hint : "Sem dados",
    value: lastSnapshot ? lastSnapshot[key].value : 0,
  }));

  // Newest events first for display
  events.reverse();

  return { events, current };
}
