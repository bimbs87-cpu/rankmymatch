export interface PremiumAvatar {
  id: string;
  sport: string;
  sportLabel: string;
  file: string; // filename like "padel-01.png"
}

const SPORTS = [
  { key: "padel", label: "Padel" },
  { key: "tennis", label: "Tênis" },
  { key: "beach", label: "Beach Tennis" },
  { key: "squash", label: "Squash" },
  { key: "pickle", label: "Pickleball" },
] as const;

export const SPORT_TABS = [
  ...SPORTS.map((s) => ({ key: s.key, label: s.label })),
  { key: "rackets", label: "Raquetes" },
];

// Vite glob import — resolves all PNGs at build time
const avatarModules = import.meta.glob<{ default: string }>(
  "/src/assets/avatars/*.png",
  { eager: true },
);

// Build a map: filename → resolved URL
const avatarUrlMap: Record<string, string> = {};
for (const [path, mod] of Object.entries(avatarModules)) {
  const filename = path.split("/").pop()!;
  avatarUrlMap[filename] = mod.default;
}

export function getAvatarUrl(id: string): string | undefined {
  // Try direct match first (e.g. "padel-01" → "padel-01.png")
  return avatarUrlMap[`${id}.png`];
}

const CHARACTER_AVATARS: PremiumAvatar[] = SPORTS.flatMap((sport) =>
  Array.from({ length: 16 }, (_, i) => {
    const num = String(i + 1).padStart(2, "0");
    return {
      id: `${sport.key}-${num}`,
      sport: sport.key,
      sportLabel: sport.label,
      file: `${sport.key}-${num}.png`,
    };
  }),
);

const RACKET_AVATARS: PremiumAvatar[] = SPORTS.flatMap((sport) =>
  Array.from({ length: 4 }, (_, i) => {
    const num = String(i + 1).padStart(2, "0");
    return {
      id: `racket-${sport.key}-${num}`,
      sport: "rackets",
      sportLabel: "Raquetes",
      file: `racket-${sport.key}-${num}.png`,
    };
  }),
);

export const PREMIUM_AVATARS: PremiumAvatar[] = [
  ...CHARACTER_AVATARS,
  ...RACKET_AVATARS,
];
