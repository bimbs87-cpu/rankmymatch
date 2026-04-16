import { PREMIUM_AVATARS, getAvatarUrl } from "@/lib/avatar-data";

interface PlayerAvatarProps {
  avatarUrl: string | null | undefined;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  xs: { container: "h-5 w-5", text: "text-[9px]" },
  sm: { container: "h-6 w-6", text: "text-[10px]" },
  md: { container: "h-7 w-7", text: "text-[10px]" },
  lg: { container: "h-10 w-10", text: "text-sm" },
  xl: { container: "h-20 w-20", text: "text-xl" },
};

export function PlayerAvatar({ avatarUrl, name = "", size = "sm", className = "" }: PlayerAvatarProps) {
  const s = SIZES[size];

  // Premium avatar (avatar:padel-01 or legacy emoji:padel-01)
  const prefix = avatarUrl?.startsWith("avatar:") ? "avatar:" : avatarUrl?.startsWith("emoji:") ? "emoji:" : null;
  if (prefix) {
    const id = avatarUrl!.replace(prefix, "");
    const src = getAvatarUrl(id);
    if (src) {
      return (
        <img
          src={src}
          alt=""
          className={`shrink-0 rounded-full object-cover ${s.container} ${className}`}
        />
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
