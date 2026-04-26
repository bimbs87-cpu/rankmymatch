import { Download, Share, MoreVertical, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useInstallFlow } from "./InstallFlowProvider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Platform = "ios" | "android-chrome" | "android-firefox" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIos) return "ios";
  const isAndroid = /Android/i.test(ua);
  if (isAndroid) {
    if (/Firefox/i.test(ua)) return "android-firefox";
    return "android-chrome";
  }
  return "desktop";
}

export function InstallInstructionsDialog({ open, onOpenChange }: Props) {
  const { canInstall, startInstall } = useInstallFlow();
  const platform = detectPlatform();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Instalar RankMyMatch</DialogTitle>
          <DialogDescription>
            Tenha acesso rápido pela tela inicial, em tela cheia e sem barra do navegador.
          </DialogDescription>
        </DialogHeader>

        {canInstall && (
          <Button
            className="w-full"
            onClick={async () => {
              await startInstall();
              onOpenChange(false);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Instalar agora
          </Button>
        )}

        <div className="space-y-4 text-sm">
          {platform === "ios" && (
            <Section title="iPhone / iPad (Safari)">
              <Step n={1}>
                Toque no ícone <Share className="inline h-4 w-4 -mt-0.5" /> <strong>Compartilhar</strong> na barra inferior.
              </Step>
              <Step n={2}>
                Role e toque em <strong>"Adicionar à Tela de Início"</strong> <Plus className="inline h-4 w-4 -mt-0.5" />.
              </Step>
              <Step n={3}>Toque em <strong>Adicionar</strong> no canto superior direito.</Step>
            </Section>
          )}

          {(platform === "android-chrome" || platform === "desktop" || platform === "unknown") && (
            <Section title="Android (Chrome / Edge)">
              <Step n={1}>
                Toque no menu <MoreVertical className="inline h-4 w-4 -mt-0.5" /> no canto superior direito.
              </Step>
              <Step n={2}>
                Toque em <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
              </Step>
              <Step n={3}>Confirme tocando em <strong>Instalar</strong>.</Step>
            </Section>
          )}

          {(platform === "android-firefox" || platform === "unknown") && (
            <Section title="Android (Firefox)">
              <Step n={1}>
                Toque no menu <MoreVertical className="inline h-4 w-4 -mt-0.5" /> no canto inferior direito.
              </Step>
              <Step n={2}>
                Toque em <strong>"Instalar"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
              </Step>
              <Step n={3}>Confirme a instalação.</Step>
              <p className="mt-2 text-xs text-muted-foreground">
                Dica: o Chrome oferece uma experiência de instalação mais completa no Android.
              </p>
            </Section>
          )}

          {platform === "desktop" && (
            <Section title="Desktop (Chrome / Edge)">
              <Step n={1}>
                Procure o ícone <Download className="inline h-4 w-4 -mt-0.5" /> na barra de endereço.
              </Step>
              <Step n={2}>Clique em <strong>Instalar</strong>.</Step>
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <ol className="space-y-2">{children}</ol>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
        {n}
      </span>
      <span className="flex-1 text-sm text-foreground">{children}</span>
    </li>
  );
}
