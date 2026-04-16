export interface PremiumAvatar {
  id: string;
  sport: string;
  sportLabel: string;
  src: string;
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

const CHARACTER_AVATARS: PremiumAvatar[] = SPORTS.flatMap((sport) =>
  Array.from({ length: 16 }, (_, i) => {
    const num = String(i + 1).padStart(2, "0");
    return {
      id: `${sport.key}-${num}`,
      sport: sport.key,
      sportLabel: sport.label,
      src: `/avatars/${sport.key}-${num}.png`,
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
      src: `/avatars/racket-${sport.key}-${num}.png`,
    };
  }),
);

export const PREMIUM_AVATARS: PremiumAvatar[] = [
  ...CHARACTER_AVATARS,
  ...RACKET_AVATARS,
];
