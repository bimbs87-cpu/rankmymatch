import { CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { useEffect } from "react";

type InstallPhase = "prompting" | "downloading" | "finalizing" | "success";

interface InstallOverlayProps {
  phase: InstallPhase;
  progress: number;
  phaseLabel: string;
}

export function InstallOverlay({ phase, progress, phaseLabel }: InstallOverlayProps) {
  // Lock body scroll while overlay is active
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Warn the user if they try to leave/close the tab during install
  useEffect(() => {
    if (phase === "success") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  const isSuccess = phase === "success";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-overlay-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.preventDefault()}
    >
      <div className="w-full max-w-sm rounded-3xl border border-primary/30 bg-card p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl mb-4 ${
              isSuccess ? "bg-success/15" : "bg-primary/15"
            }`}
          >
            {isSuccess ? (
              <CheckCircle2 className="h-8 w-8 text-success" />
            ) : (
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            )}
          </div>

          <h2
            id="install-overlay-title"
            className="text-lg font-bold text-foreground"
          >
            {isSuccess ? "RankMyMatch instalado!" : "Instalando RankMyMatch"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSuccess
              ? "Procure o ícone na sua tela inicial."
              : phaseLabel}
          </p>

          {/* Progress bar */}
          <div className="mt-5 w-full">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-primary/15">
              <div
                className={`h-full rounded-full transition-[width,background-color] duration-500 ease-out ${
                  isSuccess ? "bg-success" : "bg-primary"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="font-medium tabular-nums text-muted-foreground">
                {isSuccess ? "100%" : `${Math.round(progress)}%`}
              </span>
              {isSuccess && (
                <span className="font-semibold text-success">Concluído</span>
              )}
            </div>
          </div>

          {/* Persistent warning */}
          {!isSuccess && (
            <div
              role="alert"
              className="mt-5 w-full flex items-start gap-2 rounded-2xl border-2 border-warning/70 bg-warning/20 p-3 text-left animate-pulse"
            >
              <Smartphone className="h-5 w-5 shrink-0 text-warning mt-0.5" />
              <div className="text-xs leading-relaxed space-y-1">
                <p className="font-bold text-warning">
                  ⚠️ NÃO feche esta aba nem troque de janela
                </p>
                <p className="text-[11px] text-foreground/90">
                  A instalação pode levar até 30 segundos. Aguarde até o ícone
                  aparecer na sua tela inicial.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
