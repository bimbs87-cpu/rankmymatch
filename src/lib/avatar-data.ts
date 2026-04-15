export interface PremiumAvatar {
  id: string;
  sport: string;
  sportLabel: string;
  url: string;
}

const SPORTS = [
  { key: "padel", label: "Padel" },
  { key: "tennis", label: "Tênis" },
  { key: "beach", label: "Beach Tennis" },
  { key: "squash", label: "Squash" },
  { key: "pickleball", label: "Pickleball" },
] as const;

export const SPORT_TABS = SPORTS.map((s) => ({ key: s.key, label: s.label }));

export const PREMIUM_AVATARS: PremiumAvatar[] = SPORTS.flatMap((sport) =>
  Array.from({ length: 12 }, (_, i) => {
    const num = String(i + 1).padStart(2, "0");
    return {
      id: `${sport.key}-${num}`,
      sport: sport.key,
      sportLabel: sport.label,
      url: `/avatars/${sport.key}-${num}.png`,
    };
  }),
);
