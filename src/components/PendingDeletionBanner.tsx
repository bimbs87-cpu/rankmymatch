import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, X } from "lucide-react";
import { toast } from "sonner";
import {
  cancelAccountDeletionFn,
  getDeletionStatusFn,
} from "@/lib/delete-account.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import { useAuth } from "@/hooks/use-auth";

/**
 * Global banner shown when the authenticated user has a pending account
 * deletion. Allows them to cancel during the 7-day grace period.
 */
export function PendingDeletionBanner() {
  const { user } = useAuth();
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const statusFn = useServerFn(getDeletionStatusFn);
  const cancelFn = useServerFn(cancelAccountDeletionFn);

  useEffect(() => {
    if (!user) {
      setScheduledFor(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const headers = await getServerFnAuthHeaders();
        const status = await statusFn({ headers } as Parameters<typeof statusFn>[0]);
        if (!cancelled) setScheduledFor(status.scheduledFor);
      } catch {
        if (!cancelled) setScheduledFor(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, statusFn]);

  if (!scheduledFor) return null;

  const handleCancel = async () => {
    setBusy(true);
    try {
      const headers = await getServerFnAuthHeaders();
      await cancelFn({ headers } as Parameters<typeof cancelFn>[0]);
      toast.success("Exclusão cancelada. Sua conta continua ativa.");
      setScheduledFor(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar");
    } finally {
      setBusy(false);
    }
  };

  const date = new Date(scheduledFor);
  const daysLeft = Math.max(
    0,
    Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  return (
    <div className="sticky top-0 z-50 border-b border-amber-500/30 bg-amber-500/10 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 text-xs sm:text-sm">
        <CalendarClock className="h-4 w-4 shrink-0 text-amber-500" />
        <span className="flex-1 text-foreground">
          Sua conta será excluída em <strong>{daysLeft} dia{daysLeft === 1 ? "" : "s"}</strong>{" "}
          ({date.toLocaleDateString("pt-BR")}).
        </span>
        <button
          onClick={handleCancel}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-amber-950 transition hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "Cancelando..." : "Cancelar exclusão"}
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
