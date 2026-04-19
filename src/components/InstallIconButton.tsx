import { Download, Share, Plus } from "lucide-react";
import { useState } from "react";
import { useInstallFlow } from "./InstallFlowProvider";

/**
 * Compact "Install app" header icon. Works on both Android and iOS:
 *  - Android / Chromium: triggers the native install prompt via the install flow.
 *  - iOS Safari: opens a small instructions popover (Share → Add to Home Screen),
 *    matching the affordance Android users get.
 *
 * Hidden when the app is already installed (standalone) or there's nothing to install.
 */
export function InstallIconButton() {
  const { canInstall, isIos, isInstalled, startInstall } = useInstallFlow();
  const [iosOpen, setIosOpen] = useState(false);

  if (isInstalled) return null;
  if (!canInstall && !isIos) return null;

  const handleClick = () => {
    if (canInstall) {
      void startInstall();
      return;
    }
    if (isIos) setIosOpen((v) => !v);
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        aria-label="Instalar aplicativo"
        title="Instalar aplicativo"
        className="relative rounded-full border border-primary/40 bg-primary/10 p-2.5 transition-colors hover:bg-primary/20"
      >
        <Download className="h-4 w-4 text-primary" />
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
      </button>

      {isIos && iosOpen && (
        <>
          {/* Click-away */}
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setIosOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-[260px] rounded-2xl border border-primary/30 bg-card p-3 text-left shadow-xl">
            <p className="text-sm font-bold text-foreground">Instalar no iPhone</p>
            <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">1</span>
                <span>
                  Toque em <Share className="inline h-3.5 w-3.5 -mt-0.5 text-primary" />{" "}
                  <span className="font-semibold text-foreground">Compartilhar</span> na barra do Safari
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">2</span>
                <span>
                  Escolha <Plus className="inline h-3.5 w-3.5 -mt-0.5 text-primary" />{" "}
                  <span className="font-semibold text-foreground">Adicionar à Tela de Início</span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">3</span>
                <span>Confirme em <span className="font-semibold text-foreground">Adicionar</span></span>
              </li>
            </ol>
            <button
              onClick={() => setIosOpen(false)}
              className="mt-3 w-full rounded-full bg-primary py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
            >
              Entendi
            </button>
          </div>
        </>
      )}
    </div>
  );
}
