import { useEffect, useState } from "react";
import {
  ChevronDown,
  Calendar,
  Clock,
  MapPin,
  Trophy,
  CalendarClock,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoundExpandedDetails } from "./SeasonsPanel";

interface Props {
  groupId: string;
  isAdmin: boolean;
  /** Render only the "last completed" card. */
  variant?: "last" | "next";
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
 * - variant="next": collapsed by default
 */
export function LastAndNextRoundCards({ groupId, isAdmin, variant = "last" }: Props) {
  const [round, setRound] = useState<RoundLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(variant === "last");
  // Reload signal to refetch when round status changes (e.g., admin completes a round)
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (variant === "last") {
        // Most recent completed round — prefer scheduled_date desc, fallback created_at
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
        // Upcoming round: scheduled or in_progress, with date >= today (or no date)
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
  const Icon = isLast ? Trophy : CalendarClock;
  const accent = isLast ? "text-success" : "text-info";
  const accentBg = isLast ? "bg-success/10 ring-success/30" : "bg-info/10 ring-info/30";
  const ribbonLabel = isLast ? "Última rodada jogada" : "Próxima rodada";

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-card/70 shadow-sm transition-all ${
        isLast ? "border-success/30" : "border-info/30"
      }`}
    >
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
      {expanded && round.season_id && (
        <RoundExpandedDetails
          groupId={groupId}
          seasonId={round.season_id}
          roundId={round.id}
          isAdmin={isAdmin}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
