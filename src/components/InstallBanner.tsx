import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Download, Share, X } from "lucide-react";
import { useState } from "react";

export function InstallBanner() {
  const { canInstall, isIos, isInstalled, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);

  // Don't show if already installed, dismissed, or not eligible
  if (isInstalled || dismissed) return null;
  if (!canInstall && !isIos) return null;

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-sm p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            Instalar RankMyMatch
          </h3>
          {isIos ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Toque em{" "}
              <Share className="inline h-3.5 w-3.5 -mt-0.5" />{" "}
              <span className="font-medium text-foreground">Compartilhar</span> e depois{" "}
              <span className="font-medium text-foreground">"Adicionar à Tela de Início"</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Adicione um atalho na tela inicial do seu celular
            </p>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {canInstall && (
        <button
          onClick={install}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Instalar agora
        </button>
      )}
    </div>
  );
}
