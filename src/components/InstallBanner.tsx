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

  const phaseLabel: Record<InstallPhase, string> = {
    idle: "",
    prompting: "Confirme no aviso do navegador…",
    downloading: "Baixando o aplicativo… aguarde",
    finalizing: "Quase lá… finalizando instalação",
    success: "Instalado com sucesso!",
    cancelled: "Instalação cancelada",
  };

  const isInstalling =
    phase === "prompting" || phase === "downloading" || phase === "finalizing";
  const overlayActive = isInstalling || phase === "success";

  // CRITICAL: while the user is actively installing (or we're celebrating),
  // ALWAYS render the overlay — even if the browser flips `isInstalled` to
  // true mid-flow (Android Chrome does this the moment the user accepts the
  // prompt, well before the icon actually appears on the home screen).
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

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-sm p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Instalar RankMyMatch</h3>
          {phase === "cancelled" ? (
            <p className="mt-1 text-xs text-muted-foreground">{phaseLabel.cancelled}</p>
          ) : isIos ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Toque em <Share className="inline h-3.5 w-3.5 -mt-0.5" />{" "}
              <span className="font-medium text-foreground">Compartilhar</span> e depois{" "}
              <span className="font-medium text-foreground">"Adicionar à Tela de Início"</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Acesso rápido pela tela inicial, em tela cheia e sem barra do navegador.
            </p>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
          aria-label="Dispensar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

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
