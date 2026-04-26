import { useEffect, useState } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Input } from "@/components/ui/input";
import { NamePreviewCard } from "./NamePreviewCard";

interface Props {
  /** Called when name is saved (or already valid). */
  onComplete: () => void;
}

/**
 * Inline step that ensures the user has a real `name` in `user_profiles` before
 * continuing. If the profile already has a non-empty name, it auto-completes.
 * Otherwise it renders a form with a live 3-view preview.
 */
export function NameSetupStep({ onComplete }: Props) {
  const { user } = useAuth();
  const { profile, displayName, avatarUrl, refresh } = useUserProfile();
  const googleName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    "";

  const [name, setName] = useState(profile?.name || googleName || "");
  const [nickname, setNickname] = useState(profile?.nickname || "");
  const [saving, setSaving] = useState(false);

  // Auto-skip if profile already has a real name (and not just placeholder).
  useEffect(() => {
    if (profile?.name && profile.name.trim().length >= 2 && profile.name !== "Jogador") {
      onComplete();
    }
  }, [profile, onComplete]);

  const handleSave = async () => {
    if (!user) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      toast.error("Informe seu nome completo (mínimo 2 caracteres).");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .upsert(
          {
            user_id: user.id,
            name: trimmedName,
            nickname: nickname.trim() || null,
          },
          { onConflict: "user_id" },
        );
      if (error) throw error;
      await refresh();
      void import("@/lib/onboarding-events").then(({ trackOnboardingStep }) =>
        trackOnboardingStep("profile_completed", { has_nickname: !!nickname.trim() }),
      );
      onComplete();
    } catch (e: any) {
      console.error("Erro ao salvar perfil:", e);
      toast.error(e?.message || "Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Como você quer ser chamado?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Seu nome aparece no ranking, nas partidas e nos comentários. O apelido é opcional, mas ajuda quando há gente com nome igual.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Nome completo *
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: João Silva"
            maxLength={60}
            className="h-11 text-base"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Apelido (opcional)
          </label>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Ex: Jão"
            maxLength={20}
            className="h-11 text-base"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Se preenchido, vira o nome exibido em todos os lugares.
          </p>
        </div>
      </div>

      <NamePreviewCard
        name={name || displayName}
        nickname={nickname}
        avatarUrl={avatarUrl}
      />

      <button
        onClick={handleSave}
        disabled={saving || name.trim().length < 2}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-opacity disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        Continuar
      </button>
    </div>
  );
}
