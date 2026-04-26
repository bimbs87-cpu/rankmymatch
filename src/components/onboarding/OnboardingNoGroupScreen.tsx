import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Search, Compass, Sparkles, X, ArrowLeft, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { CreateGroupDialog } from "@/components/CreateGroupDialog";
import { ExplorePanel } from "@/components/groups/ExplorePanel";
import { WizardStepper } from "@/components/ui/wizard-stepper";
import { NameSetupStep } from "./NameSetupStep";
import { JoinByCodeForm } from "./JoinByCodeForm";

type WizardStep = "name" | "choose" | "explore" | "code";

interface Props {
  /** Called when user clicks "Pular por enquanto" — returns to whatever screen
   * embeds this onboarding so they can browse the app. */
  onSkip?: () => void;
  /** Called after a successful create or join. */
  onCompleted?: () => void;
}

/**
 * Full-screen guided onboarding for users without any group.
 * Three goals, in order:
 *   1. Make sure they have a usable display name (NameSetupStep).
 *   2. Force a clear choice: create new, browse public, or enter by code.
 *   3. Drive that choice to completion.
 *
 * It's blocking-by-default but the "Pular por enquanto" link lets the user
 * dismiss and explore the app first.
 */
export function OnboardingNoGroupScreen({ onSkip, onCompleted }: Props) {
  const { user } = useAuth();
  const { profile, displayName } = useUserProfile();
  const googleName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    "";

  // Skip the name step if the profile already has a real name set.
  const profileName = (profile?.name || "").trim();
  const hasName = profileName.length >= 2 && profileName !== "Jogador" && profileName !== googleName.trim();
  const [step, setStep] = useState<WizardStep>(hasName ? "choose" : "name");
  const [showCreate, setShowCreate] = useState(false);

  const steps = [
    { key: "name", label: "Perfil" },
    { key: "choose", label: "Grupo" },
  ];

  const firstName = (displayName || "Jogador").split(/\s+/)[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Header strip */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <Trophy className="h-4 w-4 text-primary" />
            </div>
            <span className="font-display text-sm font-bold text-foreground">RankMyMatch</span>
          </div>
          {onSkip && (
            <button
              onClick={onSkip}
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Pular por enquanto
            </button>
          )}
        </div>
        <div className="mx-auto mt-3 max-w-2xl">
          <WizardStepper
            steps={steps}
            currentStep={step === "name" ? "name" : "choose"}
          />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
        {step === "name" && (
          <NameSetupStep onComplete={() => setStep("choose")} />
        )}

        {step === "choose" && (
          <ChooseStep
            firstName={firstName}
            onCreate={() => setShowCreate(true)}
            onExplore={() => setStep("explore")}
            onCode={() => setStep("code")}
          />
        )}

        {step === "explore" && (
          <div className="space-y-4">
            <button
              onClick={() => setStep("choose")}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </button>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Explorar grupos</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Toque em um grupo para abrir e solicitar entrada.
              </p>
            </div>
            <ExplorePanel />
          </div>
        )}

        {step === "code" && (
          <JoinByCodeForm
            onBack={() => setStep("choose")}
            onJoined={() => onCompleted?.()}
          />
        )}
      </main>

      <CreateGroupDialog
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          onCompleted?.();
        }}
      />
    </div>
  );
}

function ChooseStep({
  firstName,
  onCreate,
  onExplore,
  onCode,
}: {
  firstName: string;
  onCreate: () => void;
  onExplore: () => void;
  onCode: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
          <Sparkles className="h-3 w-3" />
          Vamos começar
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Boas-vindas, {firstName}!
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
          Para usar o RankMyMatch você precisa fazer parte de um grupo. Escolha como quer começar:
        </p>
      </div>

      <div className="space-y-3">
        <ChoiceCard
          icon={Plus}
          title="Criar meu grupo"
          subtitle="Para organizar a sua feirinha, racha ou rivalidade"
          accent="primary"
          recommended
          onClick={onCreate}
        />
        <ChoiceCard
          icon={Search}
          title="Tenho um código"
          subtitle="Recebi um código tipo RMM-A4F2K9 do admin"
          accent="emerald"
          onClick={onCode}
        />
        <ChoiceCard
          icon={Compass}
          title="Explorar grupos públicos"
          subtitle="Ver grupos abertos da comunidade"
          accent="muted"
          onClick={onExplore}
        />
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Todo grupo passa por aprovação do admin. Você não consegue jogar
          sozinho — para registrar partidas, precisa estar dentro de pelo menos um grupo.
        </p>
      </div>
    </div>
  );
}

function ChoiceCard({
  icon: Icon,
  title,
  subtitle,
  accent,
  recommended,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  accent: "primary" | "emerald" | "muted";
  recommended?: boolean;
  onClick: () => void;
}) {
  const accentClasses =
    accent === "primary"
      ? "border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10"
      : accent === "emerald"
        ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500 hover:bg-emerald-500/10"
        : "border-border bg-card hover:border-primary/40";
  const iconBg =
    accent === "primary"
      ? "bg-primary/15 text-primary"
      : accent === "emerald"
        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
        : "bg-muted text-muted-foreground";

  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${accentClasses}`}
    >
      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-sm font-bold text-foreground sm:text-base">{title}</h3>
          {recommended && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
              Recomendado
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
      </div>
    </button>
  );
}
