import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Download, Share, X, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InstallOverlay } from "./InstallOverlay";

type InstallPhase = "idle" | "prompting" | "downloading" | "finalizing" | "success" | "cancelled";

export function InstallBanner() {
  const { canInstall, isIos, isInstalled, justInstalled, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<InstallPhase>("idle");
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef<number | null>(null);
  const installStartRef = useRef<number | null>(null);

  // Genuine progress: climbs slowly toward a ceiling well below 100.
  // 100% ONLY when the real `appinstalled` event fires (justInstalled).
  useEffect(() => {
    if (phase === "downloading" || phase === "finalizing") {
      // Hard ceilings — never reach 100 from the timer
      const target = phase === "downloading" ? 45 : 80;
      progressTimer.current = window.setInterval(() => {
        setProgress((p) => {
          if (p >= target) return p;
          // Very slow asymptotic approach — installs can take 10–30s
          const step = Math.max(0.08, (target - p) * 0.008);
          return Math.min(target, p + step);
        });
      }, 300);
    } else {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    }
    return () => {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    };
  }, [phase]);

  // ONLY the real `appinstalled` event can push us to success/100%.
  useEffect(() => {
    if (justInstalled && phase !== "success") {
      setProgress(100);
      setPhase("success");
      const t = window.setTimeout(() => setDismissed(true), 4000);
      return () => clearTimeout(t);
    }
  }, [justInstalled, phase]);

  const handleInstall = async () => {
    setPhase("prompting");
    setProgress(5);
    installStartRef.current = Date.now();
    try {
      // Browser shows the native prompt; user must tap "Instalar"
      const accepted = await install();
      if (!accepted) {
        setPhase("cancelled");
        setProgress(0);
        window.setTimeout(() => setPhase("idle"), 1800);
        return;
      }
      // IMPORTANT: `accepted` only means the user tapped "Install" in the
      // native prompt. The OS install can still take 10–30s after this.
      // We must wait for the real `appinstalled` event before showing 100%.
      setPhase("downloading");
      setProgress((p) => Math.max(p, 12));
      window.setTimeout(() => {
        setPhase((cur) => (cur === "downloading" ? "finalizing" : cur));
      }, 10000);
    } catch {
      setPhase("idle");
      setProgress(0);
    }
  };

  // Don't show if already installed (unless mid-celebration), dismissed, or ineligible.
  // CRITICAL: while installing, NEVER auto-hide the banner — the user needs the warning.
  if (isInstalled && phase !== "success") return null;
  const isInstalling =
    phase === "prompting" || phase === "downloading" || phase === "finalizing";
  if (dismissed && !isInstalling) return null;
  if (!canInstall && !isIos && phase === "idle") return null;

  const phaseLabel: Record<InstallPhase, string> = {
    idle: "",
    prompting: "Confirme no aviso do navegador…",
    downloading: "Baixando o aplicativo… aguarde",
    finalizing: "Quase lá… finalizando instalação",
    success: "Instalado com sucesso!",
    cancelled: "Instalação cancelada",
  };

  return (
    <>
      {(isInstalling || phase === "success") && (
        <InstallOverlay
          phase={phase as "prompting" | "downloading" | "finalizing" | "success"}
          progress={progress}
          phaseLabel={phaseLabel[phase]}
        />
      )}
    <div className="mx-4 mb-3 rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-sm p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
            phase === "success" ? "bg-success/15" : "bg-primary/15"
          }`}
        >
          {phase === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : isInstalling ? (
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          ) : (
            <Download className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {phase === "success" ? "RankMyMatch instalado!" : "Instalar RankMyMatch"}
          </h3>
          {phase === "success" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Procure o ícone na sua tela inicial.
            </p>
          ) : isInstalling || phase === "cancelled" ? (
            <p className="mt-1 text-xs text-muted-foreground">{phaseLabel[phase]}</p>
          ) : isIos ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Toque em{" "}
              <Share className="inline h-3.5 w-3.5 -mt-0.5" />{" "}
              <span className="font-medium text-foreground">Compartilhar</span> e depois{" "}
              <span className="font-medium text-foreground">"Adicionar à Tela de Início"</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Acesso rápido pela tela inicial, em tela cheia e sem barra do navegador.
            </p>
          )}
        </div>
        {!isInstalling && phase !== "success" && (
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Dispensar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress UI while installing */}
      {(isInstalling || phase === "success") && (
        <div className="mt-3 space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
            <div
              className={`h-full rounded-full transition-[width,background-color] duration-500 ease-out ${
                phase === "success" ? "bg-success" : "bg-primary"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium tabular-nums text-muted-foreground">
              {phase === "success" ? "100%" : `${Math.round(progress)}% — instalando`}
            </span>
            {phase === "success" && (
              <span className="font-semibold text-success">Concluído</span>
            )}
          </div>
        </div>
      )}

      {/* Prominent "do not close" warning — sticky during entire install */}
      {isInstalling && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl border-2 border-warning/60 bg-warning/15 p-3 animate-pulse"
        >
          <Smartphone className="h-5 w-5 shrink-0 text-warning mt-0.5" />
          <div className="text-[12px] leading-relaxed text-foreground space-y-1">
            <p className="font-bold text-warning-foreground">
              ⚠️ NÃO feche esta aba nem troque de janela
            </p>
            <p className="text-[11px] text-muted-foreground">
              A instalação pode levar até 30 segundos. Aguarde até esta mensagem
              desaparecer e o ícone aparecer na sua tela inicial.
            </p>
          </div>
        </div>
      )}

      {/* Action button */}
      {canInstall && phase === "idle" && (
        <button
          onClick={handleInstall}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Instalar agora
        </button>
      )}
      {phase === "cancelled" && (
        <button
          onClick={handleInstall}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Tentar novamente
        </button>
      )}
    </div>
    </>
  );
}
