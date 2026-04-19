/**
 * Forces users with no avatar (or only a Google fallback that failed) to
 * pick one. Shows a non-dismissible modal that opens AvatarPickerDialog.
 *
 * After 3 dismissals, the modal becomes mandatory: no "Agora não" button,
 * and only the Google photo (if available) can be used — preset/uploaded
 * options are hidden. Counter persists in localStorage.
 *
 * Mounted globally in __root.tsx for authenticated users.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { AvatarPickerDialog } from "@/components/AvatarPickerDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserCircle2, AlertCircle, Shuffle, Check, X } from "lucide-react";
import noPhotoAvatar from "@/assets/avatars/no-photo.png";
import { PREMIUM_AVATARS, getAvatarUrl } from "@/lib/avatar-data";

const DISMISSED_KEY = "rmm-avatar-prompt-dismissed-until";
const DISMISS_COUNT_KEY = "rmm-avatar-prompt-dismiss-count";
const MAX_SOFT_DISMISSALS = 3;

function needsAvatar(profile: { avatar_url: string | null } | null, googlePhoto: string | null): boolean {
  const stored = profile?.avatar_url ?? null;
  if (stored && stored !== "avatar:no-photo") return false;
  if (!stored && !googlePhoto) return true;
  if (stored === "avatar:no-photo") return true;
  return false;
}

function getDismissCount(): number {
  try {
    return Number(localStorage.getItem(DISMISS_COUNT_KEY) || 0);
  } catch {
    return 0;
  }
}

export function AvatarPromptGate() {
  const { user, isAuthenticated } = useAuth();
  const { profile, isLoading, refresh } = useUserProfile();
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dismissCount, setDismissCount] = useState(0);
  // Random-preset preview (shown before user confirms saving it)
  const [randomPreview, setRandomPreview] = useState<{ url: string } | null>(null);

  const googlePhoto = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const isMandatory = dismissCount >= MAX_SOFT_DISMISSALS;

  useEffect(() => {
    setDismissCount(getDismissCount());
  }, []);

  useEffect(() => {
    if (!isAuthenticated || isLoading || !user) {
      setOpen(false);
      return;
    }
    if (!needsAvatar(profile, googlePhoto)) {
      setOpen(false);
      return;
    }
    // If we've hit the mandatory threshold, ALWAYS show, ignoring soft-dismiss.
    if (isMandatory) {
      setOpen(true);
      return;
    }
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
  }, [isAuthenticated, isLoading, profile, googlePhoto, user, isMandatory]);

  const dismissTemporarily = () => {
    try {
      const next = getDismissCount() + 1;
      localStorage.setItem(DISMISS_COUNT_KEY, String(next));
      setDismissCount(next);
      // Last allowed soft-dismiss → suppress for 24h, after that mandatory.
      if (next < MAX_SOFT_DISMISSALS) {
        localStorage.setItem(DISMISSED_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
      } else {
        localStorage.removeItem(DISMISSED_KEY);
      }
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  // In mandatory mode WITHOUT a Google photo, the user is forced to pick a
  // preset avatar from the gallery (no uploads, no "agora não").
  const mandatoryNoGoogle = isMandatory && !googlePhoto;

  const handleSelect = async (url: string, type: "google" | "emoji") => {
    if (!user) return;
    // In mandatory mode WITH Google photo, only Google is accepted.
    if (isMandatory && googlePhoto && type !== "google") {
      toast.error("Após 3 adiamentos, apenas a foto do Google pode ser usada");
      return;
    }
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
        localStorage.removeItem(DISMISS_COUNT_KEY);
      } catch {
        /* ignore */
      }
      setDismissCount(0);
      await refresh();
      setPicker(false);
      setOpen(false);
    }
    setSaving(false);
  };

  const handleUseGoogle = async () => {
    if (!googlePhoto) return;
    await handleSelect(googlePhoto, "google");
  };

  /** Pick a random preset and show a preview — does NOT save until confirmed. */
  const rollRandomPreview = () => {
    // Avoid rolling the same one twice in a row when possible
    let pick = PREMIUM_AVATARS[Math.floor(Math.random() * PREMIUM_AVATARS.length)];
    if (randomPreview && PREMIUM_AVATARS.length > 1) {
      let attempts = 0;
      while (getAvatarUrl(pick.id) === randomPreview.url && attempts < 5) {
        pick = PREMIUM_AVATARS[Math.floor(Math.random() * PREMIUM_AVATARS.length)];
        attempts++;
      }
    }
    const url = getAvatarUrl(pick.id);
    if (!url) {
      toast.error("Não foi possível gerar um avatar aleatório, escolha um da lista");
      setPicker(true);
      return;
    }
    setRandomPreview({ url });
  };

  const confirmRandomPreview = async () => {
    if (!randomPreview) return;
    await handleSelect(randomPreview.url, "emoji");
    setRandomPreview(null);
  };

  if (!open) {
    return picker && user ? (
      <AvatarPickerDialog
        open={picker}
        onOpenChange={(o) => {
          // In mandatory mode, prevent closing without selection
          if (isMandatory && !o) return;
          setPicker(o);
        }}
        currentAvatarUrl={profile?.avatar_url ?? null}
        googlePhotoUrl={googlePhoto}
        onSelect={handleSelect}
        saving={saving}
        googleOnly={isMandatory && !!googlePhoto}
      />
    ) : null;
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-2xl">
          <div className={`mx-auto mb-4 h-20 w-20 overflow-hidden rounded-full border-2 bg-muted ${randomPreview ? "border-primary ring-4 ring-primary/20" : "border-primary/30"}`}>
            <img
              src={randomPreview?.url ?? noPhotoAvatar}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <h2 className="font-display text-lg font-bold text-foreground">
            {isMandatory ? "Foto de perfil obrigatória" : "Escolha sua foto de perfil"}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mandatoryNoGoogle
              ? "Você adiou esta etapa 3 vezes e sua conta não tem foto do Google. Escolha um avatar da nossa galeria — você é obrigado a selecionar um agora."
              : isMandatory
                ? "Você adiou esta etapa 3 vezes. Para continuar usando o app, use sua foto do Google."
                : "Para ser facilmente reconhecido nas rodadas e no ranking, escolha um avatar agora."}
          </p>

          {!isMandatory && dismissCount > 0 && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning">
              <AlertCircle className="h-3 w-3" />
              {dismissCount}/{MAX_SOFT_DISMISSALS} adiamentos usados
            </p>
          )}

          <div className="mt-5 space-y-2">
            {mandatoryNoGoogle ? (
              <>
                <button
                  onClick={handleRandomPreset}
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  <Shuffle className="h-4 w-4" />
                  Sortear um avatar pra mim
                </button>
                <button
                  onClick={() => setPicker(true)}
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background py-2.5 text-xs font-bold text-foreground hover:border-primary/50 hover:text-primary disabled:opacity-60"
                >
                  <UserCircle2 className="h-4 w-4" />
                  Escolher da galeria
                </button>
                <p className="rounded-xl border border-warning/30 bg-warning/5 p-2 text-[11px] text-warning">
                  Você precisa carregar um avatar da lista disponível para continuar.
                </p>
              </>
            ) : isMandatory && googlePhoto ? (
              <button
                onClick={handleUseGoogle}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                <img
                  src={googlePhoto}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
                Usar foto do Google
              </button>
            ) : (
              <button
                onClick={() => setPicker(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
              >
                <UserCircle2 className="h-4 w-4" />
                Escolher avatar
              </button>
            )}

            {!isMandatory && (
              <button
                onClick={dismissTemporarily}
                className="w-full rounded-2xl py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Agora não (lembrar amanhã)
              </button>
            )}
          </div>
        </div>
      </div>

      {user && (
        <AvatarPickerDialog
          open={picker}
          onOpenChange={(o) => {
            if (isMandatory && !o) return;
            setPicker(o);
          }}
          currentAvatarUrl={profile?.avatar_url ?? null}
          googlePhotoUrl={googlePhoto}
          onSelect={handleSelect}
          saving={saving}
          googleOnly={isMandatory && !!googlePhoto}
        />
      )}
    </>
  );
}
