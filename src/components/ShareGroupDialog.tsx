/**
 * Diálogo de compartilhamento de grupo (espelha QrShareDialog do perfil).
 *
 * - QR Code da URL pública do grupo.
 * - Prévia ao vivo do og:image dinâmico (`/api/og/group/$groupId`).
 * - Copiar link, compartilhar nativo, baixar QR PNG marcado.
 * - Para admins: botão "Limpar cache OG" + selo HIT/MISS.
 */
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import QRCode from "qrcode";
import { Copy, Check, Share2, X, Download, ImageIcon, ImageDown, RefreshCw, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { invalidateGroupOgCache } from "@/lib/og-cache.functions";
import { trackShareEvent } from "@/lib/track-share";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  groupName: string;
  groupId: string;
  /** Quando true mostra o botão de limpar cache OG e o selo HIT/MISS. */
  isAdmin?: boolean;
}

export function ShareGroupDialog({ open, onOpenChange, url, groupName, groupId, isAdmin = false }: Props) {
  const [copied, setCopied] = useState(false);
  const [copiedImg, setCopiedImg] = useState(false);
  const [ogLoaded, setOgLoaded] = useState(false);
  const [ogError, setOgError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copyingImg, setCopyingImg] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<"HIT" | "MISS" | "UNKNOWN" | null>(null);
  const [ogVersion, setOgVersion] = useState(0);
  const ogImgRef = useRef<HTMLImageElement>(null);
  const invalidateGroupCache = useServerFn(invalidateGroupOgCache);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setCopiedImg(false);
      setOgLoaded(false);
      setOgError(false);
      setCacheStatus(null);
    } else {
      // Counts as "share intent" — opening the dialog
      trackShareEvent(groupId, "preview");
    }
  }, [open, groupId]);

  useEffect(() => {
    if (!open || !isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/og/group/${groupId}?_=${ogVersion}`, {
          method: "HEAD",
          cache: "no-store",
        });
        const v = res.headers.get("X-Cache");
        if (cancelled) return;
        if (v === "HIT" || v === "MISS") setCacheStatus(v);
        else setCacheStatus("UNKNOWN");
      } catch {
        if (!cancelled) setCacheStatus("UNKNOWN");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isAdmin, groupId, ogVersion]);

  if (!open) return null;

  const ogImageUrl = ogVersion === 0
    ? `/api/og/group/${groupId}`
    : `/api/og/group/${groupId}?v=${ogVersion}`;

  const handleClearCache = async () => {
    if (clearingCache) return;
    setClearingCache(true);
    try {
      const res = await invalidateGroupCache({ data: { groupId } });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(
          res.deleted > 0
            ? `Cache limpo (${res.deleted} arquivo${res.deleted === 1 ? "" : "s"})`
            : "Nenhum cache para limpar",
        );
        setOgLoaded(false);
        setOgError(false);
        setCacheStatus(null);
        setOgVersion((v) => v + 1);
      }
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível limpar o cache");
    } finally {
      setClearingCache(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado!");
      void trackShareEvent(groupId, "copy");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: `Grupo ${groupName} no RankMyMatch`,
          text: `Veja o grupo ${groupName} no RankMyMatch`,
          url,
        });
        void trackShareEvent(groupId, "native");
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          toast.error("Não foi possível compartilhar");
        }
      }
    } else {
      handleCopy();
    }
  };

  const buildQrPngBlob = async (): Promise<Blob> => {
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

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, url, {
      width: QR_SIZE,
      margin: 0,
      errorCorrectionLevel: "H",
      color: { dark: "#0a0e0d", light: "#ffffff" },
    });
    ctx.drawImage(qrCanvas, PADDING, PADDING, QR_SIZE, QR_SIZE);

    // Center logo badge
    const centerX = W / 2;
    const centerY = PADDING + QR_SIZE / 2;
    const logoR = QR_SIZE * 0.09;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(centerX, centerY, logoR + 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a3ff12";
    ctx.beginPath();
    ctx.arc(centerX, centerY, logoR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0a0e0d";
    ctx.font = `800 ${Math.round(logoR * 1.4)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("R", centerX, centerY + 2);

    const footerTop = PADDING * 2 + QR_SIZE;
    ctx.fillStyle = "#0a0e0d";
    ctx.font = "800 38px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("RANKMYMATCH", centerX, footerTop + 12);

    ctx.fillStyle = "#4b5563";
    ctx.font = "500 26px Inter, system-ui, sans-serif";
    const truncatedName = groupName.length > 28 ? groupName.slice(0, 27) + "…" : groupName;
    ctx.fillText(truncatedName, centerX, footerTop + 70);

    ctx.fillStyle = "#9ca3af";
    ctx.font = "500 20px Inter, system-ui, sans-serif";
    ctx.fillText("Aponte a câmera para entrar no grupo", centerX, footerTop + 120);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error("Falha ao gerar imagem"));
        else resolve(blob);
      }, "image/png");
    });
  };

  const handleDownloadQr = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await buildQrPngBlob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `rankmymatch-grupo-${groupName.toLowerCase().replace(/\s+/g, "-")}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success("QR Code baixado!");
      void trackShareEvent(groupId, "qr");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível baixar o QR");
    } finally {
      setDownloading(false);
    }
  };

  const canCopyImage =
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    "clipboard" in navigator &&
    typeof (navigator.clipboard as Clipboard | undefined)?.write === "function" &&
    typeof (window as unknown as { ClipboardItem?: unknown }).ClipboardItem !== "undefined";

  const handleCopyImage = async () => {
    if (copyingImg) return;
    if (!canCopyImage) {
      toast.error("Seu navegador não suporta copiar imagens");
      return;
    }
    setCopyingImg(true);
    try {
      const blobPromise = buildQrPngBlob();
      const item = new ClipboardItem({ "image/png": blobPromise });
      await navigator.clipboard.write([item]);
      setCopiedImg(true);
      toast.success("Imagem copiada!");
      void trackShareEvent(groupId, "image");
      setTimeout(() => setCopiedImg(false), 2000);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível copiar a imagem");
    } finally {
      setCopyingImg(false);
    }
  };

  const handleWhatsApp = () => {
    const message = `🎾 Confira o grupo *${groupName}* no RankMyMatch!\n\nRanking, rodadas e estatísticas em tempo real.\n\n${url}`;
    const wa = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
    void trackShareEvent(groupId, "whatsapp");
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
          <h2 className="font-display text-lg font-bold text-foreground">Compartilhar grupo</h2>
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
            Aponte a câmera no QR code para abrir o grupo {groupName}.
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
                alt={`Prévia do card de compartilhamento do grupo ${groupName}`}
                className={`h-full w-full object-cover transition-opacity ${ogLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setOgLoaded(true)}
                onError={() => setOgError(true)}
                loading="lazy"
              />
              {isAdmin && cacheStatus && (
                <div
                  className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow ${
                    cacheStatus === "HIT"
                      ? "bg-primary text-primary-foreground"
                      : cacheStatus === "MISS"
                        ? "bg-amber-500 text-black"
                        : "bg-muted text-muted-foreground"
                  }`}
                  title="Status do cache da imagem OG (visível apenas para admins)"
                >
                  PNG cache · {cacheStatus}
                </div>
              )}
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
            {canCopyImage && (
              <button
                onClick={handleCopyImage}
                disabled={copyingImg}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-2.5 text-xs font-semibold text-foreground transition hover:bg-accent disabled:opacity-60"
              >
                {copiedImg ? <Check className="h-3.5 w-3.5" /> : <ImageDown className="h-3.5 w-3.5" />}
                {copyingImg ? "Copiando…" : copiedImg ? "Imagem copiada" : "Copiar imagem"}
              </button>
            )}
            <button
              onClick={handleWhatsApp}
              className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-3 py-2.5 text-xs font-semibold text-white transition hover:opacity-90"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Compartilhar no WhatsApp
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
            {isAdmin && (
              <button
                onClick={handleClearCache}
                disabled={clearingCache}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-dashed border-border bg-transparent px-3 py-2 text-[11px] font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-60"
                title="Apaga o PNG armazenado e força a geração de uma versão nova (útil após trocar logo ou nome)."
              >
                <RefreshCw className={`h-3 w-3 ${clearingCache ? "animate-spin" : ""}`} />
                {clearingCache ? "Limpando…" : "Limpar cache OG"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
