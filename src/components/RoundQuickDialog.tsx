import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Calendar, Clock, MapPin, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { RoundExpandedDetails } from "@/components/groups/internal/SeasonsPanel";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  roundId: string;
  /** Optional: avoids an extra query when the caller already knows it. */
  seasonId?: string | null;
  groupName?: string | null;
  roundNumber?: number | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  location?: string | null;
  isAdmin: boolean;
  /** Called whenever something inside the round changed (presence, scores...). */
  onChanged?: () => void;
}

/**
 * Round management in a modal — presence, draw, scores and cancel — so the user
 * never has to navigate to the group page and scroll to find the round.
 */
export function RoundQuickDialog({
  open,
  onOpenChange,
  groupId,
  roundId,
  seasonId,
  groupName,
  roundNumber,
  scheduledDate,
  scheduledTime,
  location,
  isAdmin,
  onChanged,
}: Props) {
  const [resolvedSeasonId, setResolvedSeasonId] = useState<string | null>(seasonId || null);
  const [meta, setMeta] = useState<{
    roundNumber: number | null;
    scheduledDate: string | null;
    scheduledTime: string | null;
    location: string | null;
    groupName: string | null;
  }>({
    roundNumber: roundNumber ?? null,
    scheduledDate: scheduledDate ?? null,
    scheduledTime: scheduledTime ?? null,
    location: location ?? null,
    groupName: groupName ?? null,
  });

  useEffect(() => {
    setResolvedSeasonId(seasonId || null);
    setMeta({
      roundNumber: roundNumber ?? null,
      scheduledDate: scheduledDate ?? null,
      scheduledTime: scheduledTime ?? null,
      location: location ?? null,
      groupName: groupName ?? null,
    });
  }, [roundId, seasonId, roundNumber, scheduledDate, scheduledTime, location, groupName]);

  // Fill in whatever the caller did not provide (season is required by details).
  useEffect(() => {
    if (!open || !roundId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("rounds")
        .select("season_id, round_number, scheduled_date, scheduled_time, location, groups(name)")
        .eq("id", roundId)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.season_id) setResolvedSeasonId((prev) => prev || data.season_id);
      setMeta((prev) => ({
        roundNumber: prev.roundNumber ?? data.round_number ?? null,
        scheduledDate: prev.scheduledDate ?? data.scheduled_date ?? null,
        scheduledTime: prev.scheduledTime ?? data.scheduled_time ?? null,
        location: prev.location ?? data.location ?? null,
        groupName: prev.groupName ?? (data as any).groups?.name ?? null,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, roundId]);

  const formatDate = (d: string | null) =>
    d
      ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
          weekday: "short",
          day: "2-digit",
          month: "short",
        })
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-3xl border-border bg-card p-0">
        <DialogHeader className="space-y-1 border-b border-border p-4 text-left">
          <DialogTitle className="font-display text-base font-bold text-foreground">
            {meta.roundNumber != null ? `Rodada ${meta.roundNumber}` : "Rodada"}
            {meta.groupName ? ` · ${meta.groupName}` : ""}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {meta.scheduledDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(meta.scheduledDate)}
              </span>
            )}
            {meta.scheduledTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {meta.scheduledTime.slice(0, 5)}
              </span>
            )}
            {meta.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {meta.location}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {resolvedSeasonId ? (
          <RoundExpandedDetails
            groupId={groupId}
            seasonId={resolvedSeasonId}
            roundId={roundId}
            isAdmin={isAdmin}
            onChanged={() => onChanged?.()}
          />
        ) : (
          <div className="p-6 text-center text-xs text-muted-foreground">Carregando rodada…</div>
        )}

        <div className="border-t border-border p-3">
          <Link
            to="/groups/$groupId"
            params={{ groupId }}
            search={{ view: "seasons", season: resolvedSeasonId || "", round: roundId } as any}
            onClick={() => onOpenChange(false)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/30 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver detalhes completos da rodada
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
