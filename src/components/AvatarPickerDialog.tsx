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
  /**
   * When true, only the Google photo option is rendered. Used by
   * AvatarPromptGate after the user has dismissed the mandatory prompt
   * 3 times — they must use Google or sign in with one.
   */
  googleOnly?: boolean;
}

export function AvatarPickerDialog({
  open,
  onOpenChange,
  currentAvatarUrl,
  onSelect,
  saving,
  googlePhotoUrl,
  googleOnly = false,
}: AvatarPickerDialogProps) {
  const [tab, setTab] = useState(SPORT_TABS[0].key);

  const filtered = PREMIUM_AVATARS.filter((a) => a.sport === tab);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex w-[calc(100vw-1rem)] max-w-[48rem] flex-col rounded-3xl border-border bg-card p-0 sm:w-full">
          <DialogHeader className="px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              Escolher Avatar
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 px-3 pb-3 sm:px-4 sm:pb-4">
            {googlePhotoUrl && (
              <div className="pb-1">
                <button
                  disabled={saving}
                  onClick={() => onSelect(googlePhotoUrl, "google")}
                  className={`flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition-all ${
                    currentAvatarUrl === googlePhotoUrl
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <img
                    src={googlePhotoUrl}
                    alt="Google"
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">Foto do Google</p>
                    <p className="truncate text-xs text-muted-foreground">Usar sua foto de perfil</p>
                  </div>
                  {currentAvatarUrl === googlePhotoUrl && (
                    <Check className="h-5 w-5 shrink-0 text-primary" />
                  )}
                </button>
              </div>
            )}

            {googleOnly && (
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-[11px] text-warning">
                Após 3 adiamentos, apenas a foto do Google está disponível como avatar.
              </div>
            )}

            {!googleOnly && (
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {SPORT_TABS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setTab(s.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    tab === s.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            )}

            {!googleOnly && (
            <div className="grid grid-cols-4 gap-2 pb-1 sm:grid-cols-5 sm:gap-2.5">
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
                    className={`relative flex aspect-[0.88] items-center justify-center overflow-hidden rounded-2xl border-2 bg-muted/50 transition-all sm:aspect-square ${
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
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
}
