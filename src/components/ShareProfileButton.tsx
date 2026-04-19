/**
 * Share button for player profile pages (own /profile and public /players/$userId).
 * - Tries Web Share API first (mobile-friendly)
 * - Falls back to copying the public URL to clipboard
 */
import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  playerName: string;
  className?: string;
  variant?: "primary" | "ghost";
}

export function ShareProfileButton({ userId, playerName, className, variant = "ghost" }: Props) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/players/${userId}`;
    const text = `Veja o perfil de ${playerName} no RankMyMatch`;

    // Try Web Share API
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: text, text, url });
        return;
      } catch (err) {
        // User cancelled or share failed — fall through to copy
        if ((err as Error).name === "AbortError") return;
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link do perfil copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível compartilhar");
    }
  };

  const baseCls =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:opacity-90"
      : "border border-border bg-card text-foreground hover:bg-accent";

  return (
    <button
      onClick={handleShare}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${baseCls} ${className ?? ""}`}
      aria-label="Compartilhar perfil"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
      <span>Compartilhar</span>
    </button>
  );
}
