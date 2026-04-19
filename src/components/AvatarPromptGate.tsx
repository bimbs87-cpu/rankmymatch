/**
 * Forces users with no avatar (or only a Google fallback that failed) to
 * pick one. Shows a non-dismissible modal that opens AvatarPickerDialog.
 *
 * Mounted globally in __root.tsx for authenticated users.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { AvatarPickerDialog } from "@/components/AvatarPickerDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserCircle2 } from "lucide-react";
import noPhotoAvatar from "@/assets/avatars/no-photo.png";

const DISMISSED_KEY = "rmm-avatar-prompt-dismissed-until";

/** Returns true when the user has no usable avatar set. */
function needsAvatar(profile: { avatar_url: string | null } | null, googlePhoto: string | null): boolean {
  const stored = profile?.avatar_url ?? null;
  if (stored && stored !== "avatar:no-photo") return false;
  // No stored avatar AND no Google photo → must pick one
  if (!stored && !googlePhoto) return true;
  // Explicit no-photo marker → must pick a real avatar
  if (stored === "avatar:no-photo") return true;
  return false;
}

export function AvatarPromptGate() {
  const { user, isAuthenticated } = useAuth();
  const { profile, isLoading, refresh } = useUserProfile();
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const googlePhoto = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  useEffect(() => {
    if (!isAuthenticated || isLoading || !user) {
      setOpen(false);
      return;
    }
    if (!needsAvatar(profile, googlePhoto)) {
      setOpen(false);
      return;
    }
    // Allow a soft-dismiss for 24h so the prompt doesn't block hot navigation,
    // but it always comes back.
    try {
      const until = Number(localStorage.getItem(DISMISSED_KEY) || 0);
      if (until && Date.now() < until) {
        setOpen(false);
        return;
      }
    } catch {
      /* ignore */
    }
    setOpen(true);
  }, [isAuthenticated, isLoading, profile, googlePhoto, user]);

  const dismissTemporarily = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const handleSelect = async (url: string, type: "google" | "emoji") => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ avatar_url: url, avatar_type: type === "google" ? "google" : "preset" })
      .eq("user_id", user.id);
    if (error) {
      toast.error("Erro ao salvar avatar");
    } else {
      toast.success("Avatar atualizado!");
      try {
        localStorage.removeItem(DISMISSED_KEY);
      } catch {
        /* ignore */
      }
      await refresh();
      setPicker(false);
      setOpen(false);
    }
    setSaving(false);
  };

  if (!open) {
    return picker && user ? (
      <AvatarPickerDialog
        open={picker}
        onOpenChange={setPicker}
        currentAvatarUrl={profile?.avatar_url ?? null}
        googlePhotoUrl={googlePhoto}
        onSelect={handleSelect}
        saving={saving}
      />
    ) : null;
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 h-20 w-20 overflow-hidden rounded-full border-2 border-primary/30 bg-muted">
            <img src={noPhotoAvatar} alt="" className="h-full w-full object-cover" />
          </div>
          <h2 className="font-display text-lg font-bold text-foreground">Escolha sua foto de perfil</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Para ser facilmente reconhecido nas rodadas e no ranking, escolha um avatar agora.
          </p>
          <div className="mt-5 space-y-2">
            <button
              onClick={() => setPicker(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              <UserCircle2 className="h-4 w-4" />
              Escolher avatar
            </button>
            <button
              onClick={dismissTemporarily}
              className="w-full rounded-2xl py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Agora não (lembrar amanhã)
            </button>
          </div>
        </div>
      </div>

      {user && (
        <AvatarPickerDialog
          open={picker}
          onOpenChange={setPicker}
          currentAvatarUrl={profile?.avatar_url ?? null}
          googlePhotoUrl={googlePhoto}
          onSelect={handleSelect}
          saving={saving}
        />
      )}
    </>
  );
}
