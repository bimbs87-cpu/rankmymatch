import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Download, Share, X, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type InstallPhase = "idle" | "prompting" | "downloading" | "finalizing" | "success" | "cancelled";

export function InstallBanner() {
  const { canInstall, isIos, isInstalled, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<InstallPhase>("idle");
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef<number | null>(null);

  // Genuine-feeling progress: climbs slowly and asymptotically toward a
  // ceiling that is ALWAYS below 100. Only the real `appinstalled` event
  // is allowed to push the bar to 100%. This prevents the bar from
  // looking "done" before the icon is actually on the home screen.
  useEffect(() => {
    if (phase === "downloading" || phase === "finalizing") {
      // Hard ceilings — never reach 100 from the timer
      const target = phase === "downloading" ? 60 : 90;
      progressTimer.current = window.setInterval(() => {
        setProgress((p) => {
          if (p >= target) return p;
          // Very slow asymptotic approach — installation on Android
          // typically takes 5–15s, so we want the bar to feel patient.
          const step = Math.max(0.15, (target - p) * 0.015);
          return Math.min(target, p + step);
        });
      }, 250);
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

  // When the app actually installs, complete the bar and show success
  useEffect(() => {
    if (isInstalled && phase !== "idle" && phase !== "success") {
      setProgress(100);
      setPhase("success");
      const t = window.setTimeout(() => setDismissed(true), 2400);
      return () => clearTimeout(t);
    }
  }, [isInstalled, phase]);

  const handleInstall = async () => {
    setPhase("prompting");
    setProgress(8);
    try {
      // Browser shows the native prompt here; user must tap "Install"
      const accepted = await install();
      if (!accepted) {
        setPhase("cancelled");
        setProgress(0);
        // Allow retry after short delay
        window.setTimeout(() => setPhase("idle"), 1800);
        return;
      }
      // User accepted — Chrome is now downloading icons & registering SW
      setPhase("downloading");
      setProgress((p) => Math.max(p, 20));
      // After a beat, shift into "finalizing" so the bar can climb higher
      window.setTimeout(() => {
        setPhase((cur) => (cur === "downloading" ? "finalizing" : cur));
      }, 2500);
    } catch {
      setPhase("idle");
      setProgress(0);
    }
  };

  // Don't show if already installed (and we're not mid-celebration), dismissed, or not eligible
  if (isInstalled && phase !== "success") return null;
  if (dismissed) return null;
  if (!canInstall && !isIos && phase === "idle") return null;

  const isInstalling =
    phase === "prompting" || phase === "downloading" || phase === "finalizing";

  const phaseLabel: Record<InstallPhase, string> = {
    idle: "",
    prompting: "Confirme no aviso do navegador…",
    downloading: "Baixando o aplicativo…",
    finalizing: "Finalizando instalação…",
    success: "Instalado com sucesso!",
    cancelled: "Instalação cancelada",
  };

  return (
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
              className={`h-full rounded-full transition-[width,background-color] duration-300 ease-out ${
                phase === "success" ? "bg-success" : "bg-primary"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{Math.round(progress)}%</span>
            {isInstalling && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Smartphone className="h-3 w-3" />
                Não feche o app durante a instalação
              </span>
            )}
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
  );
}
