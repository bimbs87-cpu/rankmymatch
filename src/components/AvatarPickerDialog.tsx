import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PREMIUM_AVATARS, SPORT_TABS, getAvatarUrl } from "@/lib/avatar-data";
import { Check, Shuffle, X } from "lucide-react";

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
  // Random preview: id of the avatar chosen by the dice — highlighted in the grid
  // until the user confirms with "Usar este avatar" (which then saves it).
  const [randomPickId, setRandomPickId] = useState<string | null>(null);

  const filtered = useMemo(() => PREMIUM_AVATARS.filter((a) => a.sport === tab), [tab]);

  const rollRandom = () => {
    if (!filtered.length) return;
    let pick = filtered[Math.floor(Math.random() * filtered.length)];
    if (filtered.length > 1) {
      let attempts = 0;
      while (pick.id === randomPickId && attempts < 5) {
        pick = filtered[Math.floor(Math.random() * filtered.length)];
        attempts++;
      }
    }
    setRandomPickId(pick.id);
  };

  const confirmRandom = () => {
    if (!randomPickId) return;
    onSelect(`avatar:${randomPickId}`, "emoji");
    setRandomPickId(null);
  };

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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {SPORT_TABS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => { setTab(s.key); setRandomPickId(null); }}
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

              {/* Random + confirm controls */}
              {randomPickId ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={confirmRandom}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5" /> Usar este
                  </button>
                  <button
                    onClick={rollRandom}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:border-primary/50 hover:text-primary disabled:opacity-60"
                  >
                    <Shuffle className="h-3.5 w-3.5" /> De novo
                  </button>
                  <button
                    onClick={() => setRandomPickId(null)}
                    disabled={saving}
                    aria-label="Cancelar sorteio"
                    className="flex items-center justify-center rounded-full border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={rollRandom}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 disabled:opacity-60"
                >
                  <Shuffle className="h-3.5 w-3.5" /> Sortear
                </button>
              )}
            </div>
            )}

            {!googleOnly && (
            <div className="grid grid-cols-4 gap-2 pb-1 sm:grid-cols-5 sm:gap-2.5">
              {filtered.map((avatar) => {
                const avatarKey = `avatar:${avatar.id}`;
                const isSelected = currentAvatarUrl === avatarKey || currentAvatarUrl === `emoji:${avatar.id}`;
                const isRandomPick = randomPickId === avatar.id;
                const src = getAvatarUrl(avatar.id);
                if (!src) return null;
                return (
                  <button
                    key={avatar.id}
                    disabled={saving}
                    onClick={() => { setRandomPickId(null); onSelect(avatarKey, "emoji"); }}
                    className={`relative flex aspect-[0.88] items-center justify-center overflow-hidden rounded-2xl border-2 bg-muted/50 transition-all sm:aspect-square ${
                      isRandomPick
                        ? "border-primary ring-4 ring-primary/40 scale-[1.02]"
                        : isSelected
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
                    {isRandomPick && (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                          Sorteado
                        </span>
                      </div>
                    )}
                    {!isRandomPick && isSelected && (
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
