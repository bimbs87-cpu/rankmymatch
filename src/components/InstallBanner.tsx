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

  // Minimum total install duration before we ever show 100%.
  // Android Chrome fires `appinstalled` almost immediately when the user
  // taps "Install" in the native prompt — but the OS still needs ~15–25s
  // to actually place the icon on the home screen. We IGNORE the event
  // as a completion signal and instead drive progress purely by elapsed
  // time so the bar reflects what the user actually experiences.
  const MIN_INSTALL_MS = 22000;

  // Time-based progress: bar fills linearly over MIN_INSTALL_MS, capped at 97
  // until the minimum time has fully elapsed. Only THEN do we jump to 100.
  useEffect(() => {
    if (phase !== "downloading" && phase !== "finalizing") {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
      return;
    }
    progressTimer.current = window.setInterval(() => {
      const start = installStartRef.current;
      if (!start) return;
      const elapsed = Date.now() - start;
      const ratio = Math.min(1, elapsed / MIN_INSTALL_MS);
      // Cap at 97% until time has fully elapsed AND appinstalled fired
      const capped = Math.min(97, ratio * 97);
      setProgress((p) => Math.max(p, capped));

      // Switch label from "downloading" to "finalizing" past the halfway mark
      if (elapsed > MIN_INSTALL_MS * 0.55) {
        setPhase((cur) => (cur === "downloading" ? "finalizing" : cur));
      }

      // Only complete when BOTH conditions are met: appinstalled fired
      // AND the minimum visible duration has elapsed.
      if (elapsed >= MIN_INSTALL_MS && justInstalled) {
        setProgress(100);
        setPhase("success");
      }
    }, 200);
    return () => {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    };
  }, [phase, justInstalled]);

  // Auto-dismiss after success celebration
  useEffect(() => {
    if (phase !== "success") return;
    const t = window.setTimeout(() => setDismissed(true), 4000);
    return () => clearTimeout(t);
  }, [phase]);

  // Safety net: if appinstalled never fires (some Android flows) but the
  // minimum duration has long since passed, complete after a generous timeout
  // so the user is never stuck on the overlay forever.
  useEffect(() => {
    if (phase !== "downloading" && phase !== "finalizing") return;
    const safety = window.setTimeout(() => {
      setProgress(100);
      setPhase("success");
    }, MIN_INSTALL_MS + 25000); // ~47s total worst case
    return () => clearTimeout(safety);
  }, [phase]);

  const handleInstall = async () => {
    setPhase("prompting");
    setProgress(2);
    try {
      // Browser shows the native prompt; user must tap "Instalar"
      const accepted = await install();
      if (!accepted) {
        setPhase("cancelled");
        setProgress(0);
        window.setTimeout(() => setPhase("idle"), 1800);
        return;
      }
      // User accepted. Start the timer NOW — this is when the OS install
      // actually begins. The bar will fill linearly from this moment.
      installStartRef.current = Date.now();
      setPhase("downloading");
      setProgress(4);
    } catch {
      setPhase("idle");
      setProgress(0);
    }
  };

  const isInstalling =
    phase === "prompting" || phase === "downloading" || phase === "finalizing";
  const overlayActive = isInstalling || phase === "success";

  // CRITICAL: while the user is actively installing (or we're celebrating),
  // ALWAYS render the overlay — even if the browser flips `isInstalled` to
  // true mid-flow (Android Chrome does this the moment the user accepts the
  // prompt, well before the icon actually appears on the home screen).
  // Only the overlay matters during install; the banner card is hidden.
  if (overlayActive) {
    return (
      <InstallOverlay
        phase={phase === "success" ? "success" : (phase as "prompting" | "downloading" | "finalizing")}
        progress={progress}
        phaseLabel={phaseLabel[phase]}
      />
    );
  }

  // Outside the install flow: hide if already installed, dismissed, or ineligible.
  if (isInstalled) return null;
  if (dismissed) return null;
  if (!canInstall && !isIos) return null;

  const phaseLabelLocal = phaseLabel; // keep reference stable below
  void phaseLabelLocal;

  return (
    <>
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
