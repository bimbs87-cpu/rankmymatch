import { useEffect, useState } from "react";
import {
  ChevronDown,
  Calendar,
  Clock,
  MapPin,
  Trophy,
  CalendarClock,
  Sparkles,
  Check,
  XCircle,
  Loader2,
  Ban,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RoundExpandedDetails } from "./SeasonsPanel";
import { useAuth } from "@/hooks/use-auth";
import { confirmPresence, cancelPresence } from "@/lib/round-actions";
import { toast } from "sonner";
import { CancelRoundDialog } from "@/components/CancelRoundDialog";

interface Props {
  groupId: string;
  isAdmin: boolean;
  /** Render only the "last completed" card. */
  variant?: "last" | "next";
  /** Group name (for cancel dialog context). */
  groupName?: string | null;
}

interface RoundLite {
  id: string;
  round_number: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  location: string | null;
  season_id: string | null;
  status: string;
}

function fmtFullDate(d: string | null) {
  if (!d) return "Sem data";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
}

/**
 * Self-contained card showing the most recent completed round (last) or the
 * next upcoming round (next), as a collapsible block reusing the same
 * RoundExpandedDetails used inside the seasons accordion.
 *
 * - variant="last": expanded by default
 * - variant="next": expanded by default (hero card with quick actions)
 */
export function LastAndNextRoundCards({ groupId, isAdmin, variant = "last", groupName }: Props) {
  const { user } = useAuth();
  const [round, setRound] = useState<RoundLite | null>(null);
  const [loading, setLoading] = useState(true);
  // Next variant is now a hero — start expanded so users see actions immediately.
  const [expanded, setExpanded] = useState(variant === "last" || variant === "next");
  const [reloadKey, setReloadKey] = useState(0);
  const [myStatus, setMyStatus] = useState<"confirmed" | "declined" | "pending" | null>(null);
  const [acting, setActing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (variant === "last") {
        const { data } = await supabase
          .from("rounds")
          .select("id, round_number, scheduled_date, scheduled_time, location, season_id, status")
          .eq("group_id", groupId)
          .eq("status", "completed")
          .order("scheduled_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled) setRound((data as any) ?? null);
      } else {
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
          .from("rounds")
          .select("id, round_number, scheduled_date, scheduled_time, location, season_id, status")
          .eq("group_id", groupId)
          .in("status", ["scheduled", "in_progress"])
          .or(`scheduled_date.gte.${today},scheduled_date.is.null`)
          .order("scheduled_date", { ascending: true, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled) setRound((data as any) ?? null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, variant, reloadKey]);

  // Fetch user's presence for the next round
  useEffect(() => {
    if (variant !== "next" || !round?.id || !user) {
      setMyStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("round_presence")
        .select("status")
        .eq("round_id", round.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const s = (data?.status as string | undefined) ?? null;
      if (s === "confirmed") setMyStatus("confirmed");
      else if (s === "declined" || s === "absent") setMyStatus("declined");
      else setMyStatus("pending");
    })();
    return () => {
      cancelled = true;
    };
  }, [variant, round?.id, user, reloadKey]);

  // Realtime: refresh when rounds in this group change
  useEffect(() => {
    const channel = supabase
      .channel(`last-next-${variant}-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `group_id=eq.${groupId}` },
        () => setReloadKey((k) => k + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, variant]);

  if (loading) {
    return <div className="h-20 animate-pulse rounded-2xl bg-muted/30" />;
  }
  if (!round) {
    if (variant === "next") {
      return (
        <div className="rounded-2xl border border-dashed border-border bg-card/30 px-4 py-3 text-center">
          <p className="text-[11px] font-semibold text-muted-foreground">
            <CalendarClock className="mr-1 inline h-3 w-3" />
            Nenhuma rodada futura agendada
          </p>
        </div>
      );
    }
    return null;
  }

  const isLast = variant === "last";
  const isNext = variant === "next";
  const Icon = isLast ? Trophy : CalendarClock;
  const accent = isLast ? "text-success" : "text-primary";
  const accentBg = isLast ? "bg-success/10 ring-success/30" : "bg-primary/10 ring-primary/30";
  const ribbonLabel = isLast ? "Última rodada jogada" : "Próxima rodada · em destaque";

  const handleConfirm = async () => {
    if (!user || acting) return;
    setActing(true);
    try {
      await confirmPresence(round.id, user.id);
      setMyStatus("confirmed");
      toast.success("Presença confirmada");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao confirmar");
    } finally {
      setActing(false);
    }
  };
  const handleDecline = async () => {
    if (!user || acting) return;
    setActing(true);
    try {
      await cancelPresence(round.id, user.id);
      setMyStatus("declined");
      toast.success("Resposta registrada");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao registrar");
    } finally {
      setActing(false);
    }
  };

  const borderColor = isLast ? "border-success/30" : "border-primary/40 ring-1 ring-primary/20";

  return (
    <>
      <div className={`overflow-hidden rounded-2xl border bg-card/70 shadow-sm transition-all ${borderColor}`}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent/20"
          aria-expanded={expanded}
        >
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${accentBg}`}>
            <Icon className={`h-5 w-5 ${accent}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${accent}`}>
                {isLast && <Sparkles className="mr-0.5 inline h-2.5 w-2.5" />}
                {ribbonLabel}
              </span>
              {round.round_number != null && (
                <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                  R{round.round_number}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate font-display text-sm font-bold text-foreground capitalize">
              {fmtFullDate(round.scheduled_date)}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
              {round.scheduled_time && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {round.scheduled_time.slice(0, 5)}
                </span>
              )}
              {round.location && (
                <span className="flex max-w-[14rem] items-center gap-1 truncate">
                  <MapPin className="h-3 w-3" /> {round.location}
                </span>
              )}
              {!round.scheduled_time && !round.location && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Detalhes ao expandir
                </span>
              )}
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Quick actions strip (next variant only) */}
        {isNext && user && (
          <div className="flex items-center gap-2 border-t border-border/60 bg-background/40 px-3 py-2">
            {myStatus !== "confirmed" && myStatus !== "declined" && (
              <>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={acting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-50"
                >
                  {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Vou
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={acting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-bold text-destructive active:scale-[0.98] disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Não vou
                </button>
              </>
            )}
            {myStatus === "confirmed" && (
              <>
                <span className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-success/10 px-3 py-2 text-xs font-semibold text-success">
                  <Check className="h-3.5 w-3.5" /> Você confirmou
                </span>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={acting}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-bold text-destructive active:scale-[0.98] disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Não vou mais
                </button>
              </>
            )}
            {myStatus === "declined" && (
              <>
                <span className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                  <XCircle className="h-3.5 w-3.5" /> Você não vai
                </span>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={acting}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-bold text-primary active:scale-[0.98] disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Mudei de ideia
                </button>
              </>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 text-destructive active:scale-[0.95]"
                aria-label="Cancelar rodada"
                title="Cancelar rodada"
              >
                <Ban className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {expanded && round.season_id && (
          <RoundExpandedDetails
            groupId={groupId}
            seasonId={round.season_id}
            roundId={round.id}
            isAdmin={isAdmin}
            onChanged={() => setReloadKey((k) => k + 1)}
            hidePresenceActions={isNext}
          />
        )}
      </div>

      {isNext && isAdmin && (
        <CancelRoundDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          roundId={round.id}
          roundNumber={round.round_number}
          scheduledDate={round.scheduled_date}
          groupName={groupName}
          onCancelled={() => setReloadKey((k) => k + 1)}
        />
      )}
    </>
  );
}
