export interface PremiumAvatar {
  id: string;
  sport: string;
  sportLabel: string;
  emoji: string;
  bgColor: string;
}

const SPORTS = [
  { key: "padel", label: "Padel" },
  { key: "tennis", label: "Tênis" },
  { key: "beach", label: "Beach Tennis" },
  { key: "squash", label: "Squash" },
  { key: "pickleball", label: "Pickleball" },
] as const;

export const SPORT_TABS = SPORTS.map((s) => ({ key: s.key, label: s.label }));

const SPORT_EMOJIS: Record<string, string[]> = {
  padel: ["🏸", "🎾", "🏆", "⚡", "🔥", "💪", "🎯", "🥇", "🌟", "🏅", "👑", "💥"],
  tennis: ["🎾", "🏆", "🥎", "⚡", "🔥", "💪", "🎯", "🥇", "🌟", "🏅", "👑", "💥"],
  beach: ["🏖️", "🌊", "☀️", "🏄", "🎾", "🏆", "⚡", "🔥", "🌴", "🥇", "🌟", "💪"],
  squash: ["🏸", "🏆", "⚡", "🔥", "💪", "🎯", "🥇", "🌟", "🏅", "👑", "💥", "🎖️"],
  pickleball: ["🥒", "🏓", "🏆", "⚡", "🔥", "💪", "🎯", "🥇", "🌟", "🏅", "👑", "💥"],
};

const BG_COLORS = [
  "#1a472a", "#2d3436", "#6c3483", "#1b4f72", "#7b241c",
  "#1e3a2f", "#34495e", "#4a235a", "#154360", "#641e16",
  "#0e6251", "#283747",
];

export const PREMIUM_AVATARS: PremiumAvatar[] = SPORTS.flatMap((sport) =>
  Array.from({ length: 12 }, (_, i) => ({
    id: `${sport.key}-${String(i + 1).padStart(2, "0")}`,
    sport: sport.key,
    sportLabel: sport.label,
    emoji: SPORT_EMOJIS[sport.key][i],
    bgColor: BG_COLORS[i],
  })),
);
