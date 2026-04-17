import { Download, Share, X } from "lucide-react";
import { useState } from "react";
import { useInstallFlow } from "./InstallFlowProvider";

export function InstallBanner() {
  const { canInstall, isIos, isInstalled, isFlowActive, startInstall } = useInstallFlow();
  const [dismissed, setDismissed] = useState(false);

  // Overlay handles its own UI during the flow.
  if (isFlowActive) return null;
  if (isInstalled) return null;
  if (dismissed) return null;
  if (!canInstall && !isIos) return null;

  return (
    <div className="lg:hidden mx-4 mb-3 rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-sm p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Instalar RankMyMatch</h3>
          {isIos ? (
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

      {canInstall && (
        <button
          onClick={() => void startInstall()}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Instalar agora
        </button>
      )}
    </div>
  );
}
