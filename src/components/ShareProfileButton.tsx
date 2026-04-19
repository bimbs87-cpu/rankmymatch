/**
 * Share button for player profile pages (own /profile and public /players/$userId).
 * - Opens a dialog with QR code, copy link and native share button.
 *   (Sempre abre o diálogo — assim usuários em desktop também conseguem o QR
 *   para troca presencial em quadra.)
 */
import { useState } from "react";
import { Share2 } from "lucide-react";
import { QrShareDialog } from "@/components/QrShareDialog";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  userId: string;
  playerName: string;
  className?: string;
  variant?: "primary" | "ghost";
}

export function ShareProfileButton({ userId, playerName, className, variant = "ghost" }: Props) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const isOwner = !!user && user.id === userId;
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/players/${userId}`
      : `/players/${userId}`;

  const baseCls =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:opacity-90"
      : "border border-border bg-card text-foreground hover:bg-accent";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${baseCls} ${className ?? ""}`}
        aria-label="Compartilhar perfil"
      >
        <Share2 className="h-3.5 w-3.5" />
        <span>Compartilhar</span>
      </button>
      <QrShareDialog
        open={open}
        onOpenChange={setOpen}
        url={url}
        playerName={playerName}
        userId={userId}
        isOwner={isOwner}
      />
    </>
  );
}
