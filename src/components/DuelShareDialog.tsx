import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Download, Share2 } from "lucide-react";
import { DuelShareCard, type DuelShareCardProps } from "@/components/DuelShareCard";

interface DuelShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Filename (without extension) used when downloading. */
  filenameBase?: string;
  card: DuelShareCardProps;
}

export function DuelShareDialog({ open, onOpenChange, filenameBase = "duelo", card }: DuelShareDialogProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);

  // Generate preview once dialog opens
  useEffect(() => {
    if (!open) {
      setPreviewDataUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setGenerating(true);
      try {
        // Wait two frames so the offscreen card has laid out + images had a chance to load.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const dataUrl = await renderCard(captureRef.current);
        if (!cancelled) setPreviewDataUrl(dataUrl);
      } catch (e) {
        console.error("Falha ao gerar imagem do duelo:", e);
        if (!cancelled) toast.error("Não foi possível gerar a imagem");
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, card]);

  async function handleDownload() {
    if (!previewDataUrl) return;
    setBusy("download");
    try {
      const a = document.createElement("a");
      a.href = previewDataUrl;
      a.download = `${filenameBase}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusy(null);
    }
  }

  async function handleNativeShare() {
    if (!previewDataUrl) return;
    setBusy("share");
    try {
      // Convert dataURL → Blob → File
      const blob = await (await fetch(previewDataUrl)).blob();
      const file = new File([blob], `${filenameBase}.png`, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      };
      if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
        await nav.share({
          files: [file],
          title: "Duelo — RankMyMatch",
          text: `${card.playerA.name} ${card.winsA} × ${card.winsB} ${card.playerB.name}`,
        });
      } else {
        // Fallback: trigger download
        await handleDownload();
        toast.message("Imagem baixada — abra para compartilhar manualmente");
      }
    } catch (e) {
      const err = e as Error;
      // user cancellation isn't an error worth surfacing
      if (err?.name !== "AbortError") {
        console.error(e);
        toast.error("Não foi possível compartilhar a imagem");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* Off-screen capture target — kept in DOM at full 1080×1350 for crisp output. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: -99999,
          top: 0,
          pointerEvents: "none",
          opacity: open ? 1 : 0, // mounted only when needed
        }}
      >
        {open ? <DuelShareCard ref={captureRef} {...card} /> : null}
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md gap-3">
          <DialogHeader>
            <DialogTitle>Compartilhar duelo</DialogTitle>
          </DialogHeader>

          <div className="overflow-hidden rounded-2xl border border-border bg-muted">
            {generating || !previewDataUrl ? (
              <div className="flex aspect-[4/5] w-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <img src={previewDataUrl} alt="Prévia do card do duelo" className="block w-full" />
            )}
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            Card 1080×1350 — ideal para Instagram e WhatsApp.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleDownload}
              disabled={!previewDataUrl || busy !== null}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-3 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {busy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Baixar
            </button>
            <button
              onClick={handleNativeShare}
              disabled={!previewDataUrl || busy !== null}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {busy === "share" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
              Compartilhar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Renders the offscreen card to a PNG dataURL via html-to-image. */
async function renderCard(node: HTMLElement | null): Promise<string> {
  if (!node) throw new Error("Capture target missing");
  // Lazy import keeps the bundle smaller and avoids SSR issues.
  const { toPng } = await import("html-to-image");
  return toPng(node, {
    cacheBust: true,
    pixelRatio: 1, // node is already 1080x1350 — no need to upscale
    backgroundColor: "#0a0a0d",
    skipFonts: false,
    fetchRequestInit: { mode: "cors" },
  });
}
