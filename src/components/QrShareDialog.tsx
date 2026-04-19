/**
 * Modal exibido como fallback do botão Compartilhar perfil.
 *
 * - Mostra QR Code da URL pública (para troca presencial em quadra).
 * - Permite copiar o link ou abrir o nativo `navigator.share` (mobile).
 */
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Share2, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  playerName: string;
}

export function QrShareDialog({ open, onOpenChange, url, playerName }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: `Perfil de ${playerName} no RankMyMatch`,
          text: `Veja o perfil de ${playerName} no RankMyMatch`,
          url,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          toast.error("Não foi possível compartilhar");
        }
      }
    } else {
      handleCopy();
    }
  };

  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="font-display text-lg font-bold text-foreground">Compartilhar perfil</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-5">
          <p className="mt-1 text-xs text-muted-foreground">
            Aponte a câmera no QR code para abrir o perfil de {playerName}.
          </p>

          <div className="mt-4 flex justify-center rounded-2xl bg-white p-5">
            <QRCodeSVG
              value={url}
              size={208}
              level="M"
              bgColor="#ffffff"
              fgColor="#0a0e0d"
            />
          </div>

          <div className="mt-3 truncate rounded-xl border border-border bg-muted/30 px-3 py-2 text-center text-[11px] text-muted-foreground">
            {url}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-2.5 text-xs font-semibold text-foreground transition hover:bg-accent"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado" : "Copiar link"}
            </button>
            {canNativeShare && (
              <button
                onClick={handleNativeShare}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
              >
                <Share2 className="h-3.5 w-3.5" />
                Compartilhar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
