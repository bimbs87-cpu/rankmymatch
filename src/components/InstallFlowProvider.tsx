import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { InstallOverlay } from "./InstallOverlay";

type InstallPhase = "idle" | "prompting" | "downloading" | "finalizing" | "success" | "cancelled";

interface InstallFlowContextValue {
  /** Trigger the native install prompt and show the blocking overlay. */
  startInstall: () => Promise<void>;
  /** True while the overlay is on screen (prompt → download → finalize → success). */
  isFlowActive: boolean;
  /** Convenience flags relayed from usePwaInstall. */
  canInstall: boolean;
  isIos: boolean;
  isInstalled: boolean;
}

const InstallFlowContext = createContext<InstallFlowContextValue | null>(null);

const MIN_INSTALL_MS = 22000;

export function InstallFlowProvider({ children }: { children: React.ReactNode }) {
  const { canInstall, isIos, isInstalled, justInstalled, install } = usePwaInstall();
  const [phase, setPhase] = useState<InstallPhase>("idle");
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef<number | null>(null);
  const installStartRef = useRef<number | null>(null);

  const isInstalling =
    phase === "prompting" || phase === "downloading" || phase === "finalizing";
  const isFlowActive = isInstalling || phase === "success";

  // Time-based progress, capped at 97% until appinstalled fires AND min time elapses.
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
      const capped = Math.min(97, ratio * 97);
      setProgress((p) => Math.max(p, capped));

      if (elapsed > MIN_INSTALL_MS * 0.55) {
        setPhase((cur) => (cur === "downloading" ? "finalizing" : cur));
      }

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

  // Auto-dismiss overlay after success celebration
  useEffect(() => {
    if (phase !== "success") return;
    const t = window.setTimeout(() => {
      setPhase("idle");
      setProgress(0);
    }, 4000);
    return () => clearTimeout(t);
  }, [phase]);

  // Safety net: never leave the user stuck on the overlay forever.
  useEffect(() => {
    if (phase !== "downloading" && phase !== "finalizing") return;
    const safety = window.setTimeout(() => {
      setProgress(100);
      setPhase("success");
    }, MIN_INSTALL_MS + 25000);
    return () => clearTimeout(safety);
  }, [phase]);

  const startInstall = useCallback(async () => {
    if (!canInstall || isFlowActive) return;
    setPhase("prompting");
    setProgress(2);
    try {
      const accepted = await install();
      if (!accepted) {
        setPhase("cancelled");
        setProgress(0);
        window.setTimeout(() => setPhase("idle"), 1800);
        return;
      }
      installStartRef.current = Date.now();
      setPhase("downloading");
      setProgress(4);
    } catch {
      setPhase("idle");
      setProgress(0);
    }
  }, [canInstall, install, isFlowActive]);

  const phaseLabel: Record<InstallPhase, string> = {
    idle: "",
    prompting: "Confirme no aviso do navegador…",
    downloading: "Baixando o aplicativo… aguarde",
    finalizing: "Quase lá… finalizando instalação",
    success: "Instalado com sucesso!",
    cancelled: "Instalação cancelada",
  };

  return (
    <InstallFlowContext.Provider
      value={{ startInstall, isFlowActive, canInstall, isIos, isInstalled }}
    >
      {children}
      {isFlowActive && (
        <InstallOverlay
          phase={phase === "success" ? "success" : (phase as "prompting" | "downloading" | "finalizing")}
          progress={progress}
          phaseLabel={phaseLabel[phase]}
        />
      )}
    </InstallFlowContext.Provider>
  );
}

export function useInstallFlow() {
  const ctx = useContext(InstallFlowContext);
  if (!ctx) {
    throw new Error("useInstallFlow must be used inside <InstallFlowProvider>");
  }
  return ctx;
}
