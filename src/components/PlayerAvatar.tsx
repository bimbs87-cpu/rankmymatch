import { PREMIUM_AVATARS } from "@/lib/avatar-data";

interface PlayerAvatarProps {
  avatarUrl: string | null | undefined;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  xs: { container: "h-5 w-5", text: "text-[9px]", emoji: "text-sm" },
  sm: { container: "h-6 w-6", text: "text-[10px]", emoji: "text-base" },
  md: { container: "h-7 w-7", text: "text-[10px]", emoji: "text-lg" },
  lg: { container: "h-10 w-10", text: "text-sm", emoji: "text-xl" },
  xl: { container: "h-20 w-20", text: "text-xl", emoji: "text-4xl" },
};

export function PlayerAvatar({ avatarUrl, name = "", size = "sm", className = "" }: PlayerAvatarProps) {
  const s = SIZES[size];

  // Emoji avatar (emoji:padel-01)
  if (avatarUrl?.startsWith("emoji:")) {
    const id = avatarUrl.replace("emoji:", "");
    const avatar = PREMIUM_AVATARS.find((a) => a.id === id);
    if (avatar) {
      return (
        <div
          className={`flex shrink-0 items-center justify-center rounded-full ${s.container} ${className}`}
          style={{ backgroundColor: avatar.bgColor }}
        >
          <span className={s.emoji}>{avatar.emoji}</span>
        </div>
      );
    }
  }

  // URL avatar (Google photo or image URL)
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full object-cover ${s.container} ${className}`}
      />
    );
  }

  // Fallback initials
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-muted font-bold text-foreground ${s.container} ${s.text} ${className}`}>
      {initials}
    </div>
  );
}
