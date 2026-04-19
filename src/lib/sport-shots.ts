/**
 * Sport-aware shot/position vocabularies.
 *
 * Each sport defines:
 * - shots: the list of signature shots that can be picked as "killer" or "weakness"
 * - hasCourtSide: whether "preferred court side" (left/right) makes sense (only for 2v2 sports)
 * - hasDominantHand: virtually always true (kept here for symmetry)
 */
export type SportKey = "padel" | "tennis" | "beach_tennis" | "squash" | "pickleball";

export interface SportConfig {
  label: string;
  shots: { value: string; label: string }[];
  hasCourtSide: boolean;
  /** Singles-only sports never have a "left/right" position concept. */
  isSinglesOnly: boolean;
}

const NONE = { value: "none", label: "Nenhum" };

export const SPORTS: Record<SportKey, SportConfig> = {
  padel: {
    label: "Padel",
    hasCourtSide: true,
    isSinglesOnly: false,
    shots: [
      NONE,
      { value: "bandeja", label: "Bandeja" },
      { value: "vibora", label: "Víbora" },
      { value: "smash", label: "Smash" },
      { value: "lob", label: "Lob (globo)" },
      { value: "chiquita", label: "Chiquita" },
      { value: "rulo", label: "Rulo" },
      { value: "bajada", label: "Bajada" },
      { value: "gancho", label: "Gancho" },
    ],
  },
  tennis: {
    label: "Tênis",
    hasCourtSide: false, // singles by default; doubles uses ad/deuce but we hide for simplicity
    isSinglesOnly: true,
    shots: [
      NONE,
      { value: "forehand", label: "Forehand" },
      { value: "backhand", label: "Backhand" },
      { value: "serve", label: "Saque" },
      { value: "volley", label: "Voleio" },
      { value: "smash", label: "Smash" },
      { value: "slice", label: "Slice" },
      { value: "drop_shot", label: "Drop shot" },
      { value: "lob", label: "Lob" },
      { value: "return", label: "Devolução" },
    ],
  },
  beach_tennis: {
    label: "Beach Tennis",
    hasCourtSide: true,
    isSinglesOnly: false,
    shots: [
      NONE,
      { value: "smash", label: "Smash" },
      { value: "drive", label: "Drive" },
      { value: "lob", label: "Lob" },
      { value: "drop_shot", label: "Drop shot" },
      { value: "serve", label: "Saque" },
      { value: "volley", label: "Voleio" },
      { value: "backhand", label: "Backhand" },
      { value: "forehand", label: "Forehand" },
    ],
  },
  squash: {
    label: "Squash",
    hasCourtSide: false,
    isSinglesOnly: true,
    shots: [
      NONE,
      { value: "drive", label: "Drive" },
      { value: "boast", label: "Boast" },
      { value: "drop_shot", label: "Drop shot" },
      { value: "lob", label: "Lob" },
      { value: "kill", label: "Kill" },
      { value: "volley", label: "Voleio" },
      { value: "serve", label: "Saque" },
      { value: "cross_court", label: "Cross-court" },
    ],
  },
  pickleball: {
    label: "Pickleball",
    hasCourtSide: true,
    isSinglesOnly: false,
    shots: [
      NONE,
      { value: "dink", label: "Dink" },
      { value: "drive", label: "Drive" },
      { value: "third_shot_drop", label: "Third shot drop" },
      { value: "smash", label: "Smash" },
      { value: "lob", label: "Lob" },
      { value: "volley", label: "Voleio" },
      { value: "serve", label: "Saque" },
      { value: "ernie", label: "Ernie" },
    ],
  },
};

export function normalizeSportKey(sport?: string | null): SportKey {
  if (!sport) return "padel";
  const k = sport.toLowerCase().replace(/\s|-/g, "_");
  if (k in SPORTS) return k as SportKey;
  if (k === "tenis") return "tennis";
  return "padel";
}

export function getSportConfig(sport?: string | null): SportConfig {
  return SPORTS[normalizeSportKey(sport)];
}

/**
 * Build a label map for displaying a stored shot value across any sport.
 * Useful for read-only views where we don't know which sport produced it.
 */
export function buildShotLabelMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cfg of Object.values(SPORTS)) {
    for (const s of cfg.shots) out[s.value] = s.label;
  }
  return out;
}

export const ALL_SHOT_LABELS = buildShotLabelMap();
