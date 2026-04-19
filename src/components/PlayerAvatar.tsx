import { PREMIUM_AVATARS, getAvatarUrl } from "@/lib/avatar-data";
import noPhotoAvatar from "@/assets/avatars/no-photo.png";

interface PlayerAvatarProps {
  avatarUrl: string | null | undefined;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  /** When true, renders the avatar with reduced opacity + grayscale to indicate the player is no longer an active group member. */
  dimmed?: boolean;
}

const SIZES = {
  xs: { container: "h-5 w-5", text: "text-[9px]" },
  sm: { container: "h-6 w-6", text: "text-[10px]" },
  md: { container: "h-7 w-7", text: "text-[10px]" },
  lg: { container: "h-10 w-10", text: "text-sm" },
  xl: { container: "h-20 w-20", text: "text-xl" },
};

export function PlayerAvatar({ avatarUrl, name = "", size = "sm", className = "", dimmed = false }: PlayerAvatarProps) {
  const s = SIZES[size];
  const dimClass = dimmed ? "opacity-40 grayscale" : "";

  // Special "no photo" marker → use the generic silhouette avatar
  if (avatarUrl === "avatar:no-photo") {
    return (
      <img
        src={noPhotoAvatar}
        alt=""
        className={`shrink-0 rounded-full object-cover ${s.container} ${dimClass} ${className}`}
      />
    );
  }

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
          className={`shrink-0 rounded-full object-cover ${s.container} ${dimClass} ${className}`}
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
        className={`shrink-0 rounded-full object-cover ${s.container} ${dimClass} ${className}`}
        onError={(e) => {
          // If the remote photo fails (e.g. expired Google URL), swap to the no-photo silhouette
          (e.currentTarget as HTMLImageElement).src = noPhotoAvatar;
        }}
      />
    );
  }

  // No avatar at all → silhouette (replaces old initials fallback)
  return (
    <img
      src={noPhotoAvatar}
      alt={name ? `Foto de ${name}` : ""}
      className={`shrink-0 rounded-full object-cover ${s.container} ${dimClass} ${className}`}
    />
  );
}
