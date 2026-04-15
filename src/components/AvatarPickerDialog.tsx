import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PREMIUM_AVATARS, SPORT_TABS } from "@/lib/avatar-data";
import { Check } from "lucide-react";

interface AvatarPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAvatarUrl: string | null;
  onSelect: (avatarUrl: string) => void;
  saving?: boolean;
}

export function AvatarPickerDialog({
  open,
  onOpenChange,
  currentAvatarUrl,
  onSelect,
  saving,
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

        {/* Sport tabs */}
        <div className="flex gap-1.5 overflow-x-auto px-5 pb-2 scrollbar-none">
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
            const isSelected = currentAvatarUrl === avatar.url;
            return (
              <button
                key={avatar.id}
                disabled={saving}
                onClick={() => onSelect(avatar.url)}
                className={`relative aspect-square overflow-hidden rounded-2xl border-2 transition-all ${
                  isSelected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-transparent hover:border-border"
                }`}
              >
                <img
                  src={avatar.url}
                  alt={avatar.id}
                  loading="lazy"
                  className="h-full w-full object-cover"
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
