import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PREMIUM_AVATARS, SPORT_TABS, getAvatarUrl } from "@/lib/avatar-data";
import { Check } from "lucide-react";

interface AvatarPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAvatarUrl: string | null;
  onSelect: (avatarUrl: string, type: "google" | "emoji") => void;
  saving?: boolean;
  googlePhotoUrl?: string | null;
}

export function AvatarPickerDialog({
  open,
  onOpenChange,
  currentAvatarUrl,
  onSelect,
  saving,
  googlePhotoUrl,
}: AvatarPickerDialogProps) {
  const [tab, setTab] = useState(SPORT_TABS[0].key);

  const filtered = PREMIUM_AVATARS.filter((a) => a.sport === tab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-hidden rounded-3xl border-border bg-card p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="font-display text-lg font-bold text-foreground">
            Escolher Avatar
          </DialogTitle>
        </DialogHeader>

        {/* Google photo option */}
        {googlePhotoUrl && (
          <div className="px-5 pb-1">
            <button
              disabled={saving}
              onClick={() => onSelect(googlePhotoUrl, "google")}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 transition-all ${
                currentAvatarUrl === googlePhotoUrl
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <img
                src={googlePhotoUrl}
                alt="Google"
                className="h-10 w-10 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-foreground">Foto do Google</p>
                <p className="text-xs text-muted-foreground">Usar sua foto de perfil</p>
              </div>
              {currentAvatarUrl === googlePhotoUrl && (
                <Check className="h-5 w-5 text-primary" />
              )}
            </button>
          </div>
        )}

        {/* Sport tabs */}
        <div className="flex gap-1.5 overflow-x-auto px-5 pb-2 scrollbar-none [&::-webkit-scrollbar]:hidden">
          {SPORT_TABS.map((s) => (
            <button
              key={s.key}
              onClick={() => setTab(s.key)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                tab === s.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Avatar grid */}
        <div className="grid max-h-[50vh] grid-cols-4 gap-3 overflow-y-auto px-5 pb-5">
          {filtered.map((avatar) => {
            const avatarKey = `avatar:${avatar.id}`;
            const isSelected = currentAvatarUrl === avatarKey || currentAvatarUrl === `emoji:${avatar.id}`;
            const src = getAvatarUrl(avatar.id);
            if (!src) return null;
            return (
              <button
                key={avatar.id}
                disabled={saving}
                onClick={() => onSelect(avatarKey, "emoji")}
                className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border-2 bg-muted/50 transition-all ${
                  isSelected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-transparent hover:border-border"
                }`}
              >
                <img
                  src={src}
                  alt={avatar.id}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
                    <Check className="h-6 w-6 text-primary-foreground drop-shadow-md" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
