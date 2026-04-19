/**
 * Modal exibido como fallback do botão Compartilhar perfil.
 *
 * - Mostra QR Code da URL pública (para troca presencial em quadra).
 * - Mostra prévia ao vivo do og:image que será exibido em links compartilhados.
 * - Permite copiar o link, compartilhar via Web Share, e baixar o QR Code como PNG
 *   256x256 com a marca RankMyMatch impressa abaixo (pronto para colar em raquete/saco).
 */
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import QRCode from "qrcode";
import { Copy, Check, Share2, X, Download, ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  playerName: string;
  userId: string;
}

export function QrShareDialog({ open, onOpenChange, url, playerName, userId }: Props) {
  const [copied, setCopied] = useState(false);
  const [ogLoaded, setOgLoaded] = useState(false);
  const [ogError, setOgError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const ogImgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setOgLoaded(false);
      setOgError(false);
    }
  }, [open]);

  if (!open) return null;

  const ogImageUrl = `/api/og/player/${userId}`;

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

  /**
   * Generates a 600x680 branded PNG: QR (256px) + RankMyMatch wordmark below
   * + player name. Triggers a download. Uses canvas + qrcode lib (separate
   * from QRCodeSVG above so we get a clean PNG without DOM serialization).
   */
  const handleDownloadQr = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const QR_SIZE = 512;
      const PADDING = 44;
      const FOOTER_H = 200;
      const W = QR_SIZE + PADDING * 2;
      const H = QR_SIZE + PADDING * 2 + FOOTER_H;

      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas not supported");

      // Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      // Render QR to a temp canvas
      const qrCanvas = document.createElement("canvas");
      await QRCode.toCanvas(qrCanvas, url, {
        width: QR_SIZE,
        margin: 0,
        errorCorrectionLevel: "H",
        color: { dark: "#0a0e0d", light: "#ffffff" },
      });
      ctx.drawImage(qrCanvas, PADDING, PADDING, QR_SIZE, QR_SIZE);

      // Center logo badge (rally green circle with "R") — small, ~14% of QR
      const centerX = W / 2;
      const centerY = PADDING + QR_SIZE / 2;
      const logoR = QR_SIZE * 0.09;
      // White ring
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoR + 8, 0, Math.PI * 2);
      ctx.fill();
      // Green disc
      ctx.fillStyle = "#a3ff12";
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoR, 0, Math.PI * 2);
      ctx.fill();
      // "R"
      ctx.fillStyle = "#0a0e0d";
      ctx.font = `800 ${Math.round(logoR * 1.4)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("R", centerX, centerY + 2);

      // Footer: brand + player name
      const footerTop = PADDING * 2 + QR_SIZE;
      ctx.fillStyle = "#0a0e0d";
      ctx.font = "800 38px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("RANKMYMATCH", centerX, footerTop + 12);

      ctx.fillStyle = "#4b5563";
      ctx.font = "500 26px Inter, system-ui, sans-serif";
      const truncatedName = playerName.length > 28 ? playerName.slice(0, 27) + "…" : playerName;
      ctx.fillText(truncatedName, centerX, footerTop + 70);

      ctx.fillStyle = "#9ca3af";
      ctx.font = "500 20px Inter, system-ui, sans-serif";
      ctx.fillText("Aponte a câmera para ver o perfil", centerX, footerTop + 120);

      // Trigger download
      canvas.toBlob((blob) => {
        if (!blob) {
          toast.error("Falha ao gerar imagem");
          setDownloading(false);
          return;
        }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `rankmymatch-${playerName.toLowerCase().replace(/\s+/g, "-")}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast.success("QR Code baixado!");
        setDownloading(false);
      }, "image/png");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível baixar o QR");
      setDownloading(false);
    }
  };

  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="my-auto w-full max-w-sm rounded-3xl border border-border bg-card shadow-2xl"
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

          {/* Live OG preview */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <ImageIcon className="h-3 w-3" />
              Prévia do link compartilhado
            </div>
            <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-xl border border-border bg-muted/40">
              {!ogLoaded && !ogError && (
                <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
                  Carregando prévia…
                </div>
              )}
              {ogError && (
                <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
                  Não foi possível carregar a prévia
                </div>
              )}
              <img
                ref={ogImgRef}
                src={ogImageUrl}
                alt={`Prévia do card de compartilhamento de ${playerName}`}
                className={`h-full w-full object-cover transition-opacity ${ogLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setOgLoaded(true)}
                onError={() => setOgError(true)}
                loading="lazy"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-2.5 text-xs font-semibold text-foreground transition hover:bg-accent"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado" : "Copiar link"}
            </button>
            <button
              onClick={handleDownloadQr}
              disabled={downloading}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-2.5 text-xs font-semibold text-foreground transition hover:bg-accent disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              {downloading ? "Gerando…" : "Baixar QR"}
            </button>
            {canNativeShare && (
              <button
                onClick={handleNativeShare}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
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
