import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Trophy, Calendar, Plus, ChevronRight, ChevronDown, CircleDot, CheckCircle2,
  Clock, MapPin, Pencil, Ban, X, Settings, Check, Flag, RotateCcw, Trash2, PlusCircle, Bell,
} from "lucide-react";
import { useGroupSeasons } from "@/hooks/use-seasons";
import { useSeasonRounds } from "@/hooks/use-rounds";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SeasonFinalRanking } from "./SeasonFinalRanking";
import { QuickCreateSeasonDialog } from "./QuickCreateSeasonDialog";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerAvatarLink } from "@/components/PlayerProfileViewer";
import { GroupSummaryCards } from "./GroupSummaryCards";
import { SeasonsTimeline } from "./SeasonsTimeline";
import { createExtraRound as createExtraRoundFn } from "@/lib/extra-round";
import { ScoreEntryDialog } from "@/components/ScoreEntryDialog";
import { AdminAddPresenceDialog } from "@/components/AdminAddPresenceDialog";
import { UserPlus } from "lucide-react";

type SeasonFilter = "all" | "active" | "finished";

function useSeasonProgress(seasonId: string, totalRounds: number | null) {
  const [completed, setCompleted] = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: rounds } = await supabase
        .from("rounds").select("status").eq("season_id", seasonId);
      if (cancelled) return;
      const created = rounds?.length || 0;
      const done = (rounds || []).filter((r) => r.status === "completed").length;
      const canc = (rounds || []).filter((r) => r.status === "cancelled").length;
      setCompleted(done);
      setCancelledCount(canc);
      setTotal(totalRounds ?? created);
    })();
    return () => { cancelled = true; };
  }, [seasonId, totalRounds]);
  return { completed, cancelled: cancelledCount, total };
}

function RoundsProgress({ seasonId, totalRounds, seasonStatus }: { seasonId: string; totalRounds: number | null; seasonStatus?: string }) {
  const { completed, cancelled, total } = useSeasonProgress(seasonId, totalRounds);
  if (!total) return null;
  const consumed = completed + cancelled;
  const remaining = Math.max(0, total - consumed);
  const isFinished = seasonStatus === "finished" || seasonStatus === "completed" || seasonStatus === "closed";
  // When finished, the bar represents the actual outcome: cancelled stays red at its
  // proportional slot, the rest fills green (completed). When active, remaining stays grey.
  const base = isFinished ? Math.max(1, completed + cancelled) : total;
  const cancPct = Math.min(100, (cancelled / base) * 100);
  const donePct = Math.min(100 - cancPct, (completed / base) * 100);
  const tooltip = isFinished
    ? `Temporada encerrada — ${completed} concluída${completed === 1 ? "" : "s"}, ${cancelled} cancelada${cancelled === 1 ? "" : "s"}`
    : `${completed} concluída${completed === 1 ? "" : "s"}, ${cancelled} cancelada${cancelled === 1 ? "" : "s"}, ${remaining} restante${remaining === 1 ? "" : "s"}`;
  return (
    <span className="flex items-center gap-1.5" title={tooltip}>
      <span className="tabular-nums">{consumed} de {total} rodadas</span>
      <span className="relative h-1 w-16 rounded-full bg-muted overflow-hidden flex">
        <span className="h-full bg-primary transition-all" style={{ width: `${donePct}%` }} />
        <span className="h-full bg-destructive transition-all" style={{ width: `${cancPct}%` }} />
      </span>
    </span>
  );
}

interface Props {
  groupId: string;
  isAdmin: boolean;
  /** Auto-expand this season on mount (e.g. deep-link from dashboard). */
  initialSeasonId?: string;
  /** Auto-expand this round inside the season (works with initialSeasonId). */
  initialRoundId?: string;
}

export function SeasonsPanel({ groupId, isAdmin, initialSeasonId, initialRoundId }: Props) {
  const { seasons, isLoading, refresh } = useGroupSeasons(groupId);
  const [expandedId, setExpandedId] = useState<string | null>(initialSeasonId ?? null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [groupFormat, setGroupFormat] = useState<string>("doubles");
  const [groupFixedDay, setGroupFixedDay] = useState<number | null>(null);
  const filterStorageKey = `agenda-filter:${groupId}`;
  const [filter, setFilterState] = useState<SeasonFilter>(() => {
    if (typeof window === "undefined") return "all";
    const saved = window.localStorage.getItem(filterStorageKey);
    return saved === "active" || saved === "finished" || saved === "all" ? saved : "all";
  });
  const setFilter = (f: SeasonFilter) => {
    setFilterState(f);
    try { window.localStorage.setItem(filterStorageKey, f); } catch {}
  };

  // When a deep-link arrives (initialSeasonId/round), expand that season and scroll to it.
  useEffect(() => {
    if (initialSeasonId) {
      setExpandedId(initialSeasonId);
      requestAnimationFrame(() => {
        document.getElementById(`season-${initialSeasonId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [initialSeasonId, initialRoundId]);

  // Realtime: refresh when any round in this group changes (status flips, etc.)
  useEffect(() => {
    const channel = supabase
      .channel(`seasons-panel-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `group_id=eq.${groupId}` },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "seasons", filter: `group_id=eq.${groupId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, refresh]);

  // Load group's default match format for the quick-create dialog
  useEffect(() => {
    supabase
      .from("groups")
      .select("match_format, fixed_day")
      .eq("id", groupId)
      .single()
      .then(({ data }) => {
        if (data?.match_format) setGroupFormat(data.match_format);
        if (data && "fixed_day" in data) setGroupFixedDay((data as any).fixed_day ?? null);
      });
  }, [groupId]);

  const active = seasons.filter((s) => s.status === "active");
  const finished = seasons.filter((s) => s.status !== "active");
  const showActive = filter === "all" || filter === "active";
  const showFinished = filter === "all" || filter === "finished";

  const handleTimelineSelect = (sid: string) => {
    setExpandedId(sid);
    // ensure visible under current filter
    const s = seasons.find((x) => x.id === sid);
    if (s) {
      if (s.status === "active" && filter === "finished") setFilter("all");
      if (s.status !== "active" && filter === "active") setFilter("all");
    }
    requestAnimationFrame(() => {
      document.getElementById(`season-${sid}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Agenda e resultados</h2>
          <p className="text-xs text-muted-foreground">
            Visão geral do grupo, temporadas e rodadas
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setQuickCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Nova
          </button>
        )}
      </div>

      {/* Group-wide summary cards (totais do grupo todo) */}
      <GroupSummaryCards groupId={groupId} />

      {/* Mini timeline showing season spans */}
      {seasons.length > 0 && (
        <SeasonsTimeline seasons={seasons.map((s: any) => ({ ...s, group_id: groupId })) as any} onSelect={handleTimelineSelect} />
      )}

      {/* Quick filter chips */}
      {seasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {([
            { key: "all", label: "Todas", count: seasons.length },
            { key: "active", label: "Em andamento", count: active.length },
            { key: "finished", label: "Encerradas", count: finished.length },
          ] as { key: SeasonFilter; label: string; count: number }[]).map((opt) => {
            const isOn = filter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilter(opt.key)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-all ${
                  isOn
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
                <span className={`tabular-nums ${isOn ? "opacity-90" : "opacity-60"}`}>
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {quickCreateOpen && (
        <QuickCreateSeasonDialog
          groupId={groupId}
          defaultMatchFormat={groupFormat}
          fixedDay={groupFixedDay}
          onClose={() => setQuickCreateOpen(false)}
          onCreated={refresh}
        />
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/30" />)}
        </div>
      ) : seasons.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-muted/10 py-12 text-center">
          <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Nenhuma temporada ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAdmin ? "Crie a primeira temporada para começar." : "Aguarde o admin criar uma temporada."}
          </p>
        </div>
      ) : (
        <>
          {showActive && active.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-success">
                <CircleDot className="h-3 w-3" /> Em andamento
              </h3>
              {active.map((s) => (
                <div key={s.id} id={`season-${s.id}`}>
                  <SeasonAccordion
                    season={s}
                    groupId={groupId}
                    isAdmin={isAdmin}
                    expanded={expandedId === s.id}
                    onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    onChanged={refresh}
                    initialRoundId={expandedId === s.id ? initialRoundId : undefined}
                  />
                </div>
              ))}
            </section>
          )}

          {showFinished && finished.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <CheckCircle2 className="h-3 w-3" /> Encerradas
              </h3>
              {finished.map((s) => (
                <div key={s.id} id={`season-${s.id}`}>
                  <SeasonAccordion
                    season={s}
                    groupId={groupId}
                    isAdmin={isAdmin}
                    expanded={expandedId === s.id}
                    onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    onChanged={refresh}
                    initialRoundId={expandedId === s.id ? initialRoundId : undefined}
                  />
                </div>
              ))}
            </section>
          )}

          {((showActive && active.length === 0) || (showFinished && finished.length === 0)) &&
            !(showActive && active.length > 0) &&
            !(showFinished && finished.length > 0) && (
              <div className="rounded-2xl border border-dashed border-border bg-muted/10 py-8 text-center text-xs text-muted-foreground">
                Nenhuma temporada nesse filtro.
              </div>
            )}
        </>
      )}
    </div>
  );
}

function SeasonAccordion({
  season, groupId, isAdmin, expanded, onToggle, onChanged, initialRoundId,
}: {
  season: any; groupId: string; isAdmin: boolean; expanded: boolean; onToggle: () => void; onChanged: () => void; initialRoundId?: string;
}) {
  const isActive = season.status === "active";
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(season.name);
  const [savingName, setSavingName] = useState(false);

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === season.name) { setEditingName(false); return; }
    setSavingName(true);
    const { error } = await supabase.from("seasons").update({ name: trimmed }).eq("id", season.id);
    if (error) toast.error("Erro ao renomear temporada");
    else { toast.success("Nome atualizado"); onChanged(); }
    setSavingName(false);
    setEditingName(false);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
      <div className="flex w-full items-center gap-3 p-4 text-left">
        <button onClick={onToggle} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            isActive ? "bg-primary/15 text-primary" : "bg-muted/40 text-muted-foreground"
          }`}>
            <Trophy className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {editingName ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveName(); } if (e.key === "Escape") { setEditingName(false); setNameDraft(season.name); } }}
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-display text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              ) : (
                <h4 className="truncate font-display text-sm font-bold text-foreground">{season.name}</h4>
              )}
              {isActive && !editingName && (
                <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">
                  Ativa
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {(() => {
                  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
                  if (season.start_date && season.end_date) return `${fmt(season.start_date)} – ${fmt(season.end_date)}`;
                  if (season.start_date) return `desde ${fmt(season.start_date)}`;
                  return new Date(season.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
                })()}
              </span>
              <span>·</span>
              <span>{season.match_format === "1v1" ? "Singles" : "Duplas"}</span>
              <span>·</span>
              <RoundsProgress seasonId={season.id} totalRounds={season.total_rounds} seasonStatus={season.status} />
            </div>
          </div>
        </button>
        {isAdmin && (
          editingName ? (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={saveName} disabled={savingName} className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50" title="Salvar">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={() => { setEditingName(false); setNameDraft(season.name); }} className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground" title="Cancelar">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground shrink-0" title="Renomear temporada">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )
        )}
        <button onClick={onToggle} className="flex h-8 w-8 items-center justify-center shrink-0 text-muted-foreground" aria-label={expanded ? "Recolher" : "Expandir"}>
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border bg-background/40">
          <SeasonFinalRanking seasonId={season.id} isActive={isActive} />
          <SeasonRoundsInline groupId={groupId} seasonId={season.id} isAdmin={isAdmin} initialRoundId={initialRoundId} />
          {isAdmin && <SeasonStatusActions season={season} onChanged={onChanged} />}
        </div>
      )}
    </div>
  );
}

function SeasonStatusActions({ season, onChanged }: { season: any; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const isActive = season.status === "active";

  const finish = async () => {
    if (!window.confirm(`Encerrar a temporada "${season.name}"?\n\nO ranking final será congelado e novas rodadas não poderão ser criadas nela.`)) return;
    setBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    const patch: any = { status: "finished", updated_at: new Date().toISOString() };
    if (!season.end_date) patch.end_date = today;
    const { error } = await supabase.from("seasons").update(patch).eq("id", season.id);
    if (error) toast.error("Erro ao encerrar temporada");
    else {
      toast.success("Temporada encerrada");
      const { logAudit } = await import("@/lib/audit-log");
      await logAudit({
        groupId: season.group_id,
        action: "season_finished",
        entityType: "season",
        entityId: season.id,
        oldData: { status: season.status, end_date: season.end_date },
        newData: { status: "finished", end_date: patch.end_date ?? season.end_date },
      });
      // Active season changed → invalidate group OG cache
      try {
        const { invalidateGroupOgCache } = await import("@/lib/og-cache.functions");
        await invalidateGroupOgCache({ data: { groupId: season.group_id } });
      } catch {}
      onChanged();
    }
    setBusy(false);
  };

  const reopen = async () => {
    if (!window.confirm(`Reabrir "${season.name}"? A temporada voltará a ficar ativa.`)) return;
    setBusy(true);
    const { error } = await supabase.from("seasons").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", season.id);
    if (error) toast.error("Erro ao reabrir");
    else {
      toast.success("Temporada reaberta");
      try {
        const { invalidateGroupOgCache } = await import("@/lib/og-cache.functions");
        await invalidateGroupOgCache({ data: { groupId: season.group_id } });
      } catch {}
      onChanged();
    }
    setBusy(false);
  };

  const remove = async () => {
    const confirmText = `EXCLUIR ${season.name}`;
    const typed = window.prompt(
      `⚠️ Excluir permanentemente a temporada "${season.name}"?\n\nIsso vai apagar:\n• Todas as rodadas, partidas e sets\n• Todos os pontos de Elo e snapshots de ranking\n• Estatísticas dos jogadores nesta temporada\n\nEsta ação NÃO pode ser desfeita.\n\nDigite "${confirmText}" para confirmar:`
    );
    if (typed !== confirmText) {
      if (typed !== null) toast.error("Texto de confirmação não confere");
      return;
    }
    setBusy(true);
    try {
      // Fetch rounds belonging to this season
      const { data: rounds, error: rErr } = await supabase
        .from("rounds").select("id").eq("season_id", season.id);
      if (rErr) throw rErr;
      const roundIds = (rounds ?? []).map((r) => r.id);

      if (roundIds.length) {
        const { data: matches, error: mErr } = await supabase
          .from("matches").select("id").in("round_id", roundIds);
        if (mErr) throw mErr;
        const matchIds = (matches ?? []).map((m) => m.id);

        if (matchIds.length) {
          // delete in dependency order
          await supabase.from("match_sets").delete().in("match_id", matchIds);
          await supabase.from("match_players").delete().in("match_id", matchIds);
          await supabase.from("match_confirmations").delete().in("match_id", matchIds);
          await supabase.from("rating_events").delete().in("match_id", matchIds);
          await supabase.from("matches").delete().in("id", matchIds);
        }
        await supabase.from("courts").delete().in("round_id", roundIds);
        await supabase.from("round_presence").delete().in("round_id", roundIds);
        await supabase.from("waiting_list").delete().in("round_id", roundIds);
        await supabase.from("rounds").delete().in("id", roundIds);
      }

      await supabase.from("ranking_snapshots").delete().eq("season_id", season.id);
      await supabase.from("player_stats_by_season").delete().eq("season_id", season.id);

      const { error: sErr } = await supabase.from("seasons").delete().eq("id", season.id);
      if (sErr) throw sErr;

      toast.success(`Temporada "${season.name}" excluída`);
      onChanged();
    } catch (err: any) {
      console.error("Erro ao excluir temporada", err);
      toast.error(err?.message || "Erro ao excluir temporada");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-border bg-muted/10 p-3 space-y-2">
      {isActive ? (
        <button
          onClick={finish}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-warning/30 bg-warning/10 py-2.5 text-xs font-bold text-warning hover:bg-warning/20 disabled:opacity-50"
        >
          <Flag className="h-3.5 w-3.5" /> Encerrar temporada
        </button>
      ) : (
        <button
          onClick={reopen}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-xs font-bold text-muted-foreground hover:bg-accent/30 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reabrir temporada
        </button>
      )}
      <button
        onClick={remove}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 py-2.5 text-xs font-bold text-destructive hover:bg-destructive/15 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" /> Excluir temporada
      </button>
    </div>
  );
}

function SeasonRoundsInline({ groupId, seasonId, isAdmin, initialRoundId }: { groupId: string; seasonId: string; isAdmin: boolean; initialRoundId?: string }) {
  const { user } = useAuth();
  const { rounds, isLoading, refresh } = useSeasonRounds(seasonId);
  const [editing, setEditing] = useState(false);
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [editDates, setEditDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(initialRoundId ?? null);

  // Auto-expand + scroll when a deep-link round arrives.
  useEffect(() => {
    if (initialRoundId) {
      setExpandedId(initialRoundId);
      requestAnimationFrame(() => {
        document.getElementById(`round-${initialRoundId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [initialRoundId]);
  const [showExtraForm, setShowExtraForm] = useState(false);
  const [extraDate, setExtraDate] = useState("");
  const [extraTime, setExtraTime] = useState("");
  const [extraLocation, setExtraLocation] = useState("");
  const [creatingExtra, setCreatingExtra] = useState(false);
  // Manual push dialog state
  const [pushTargetRound, setPushTargetRound] = useState<any | null>(null);
  const [pushMessage, setPushMessage] = useState("");
  const [sendingPush, setSendingPush] = useState(false);

  // Pre-fill defaults (group's regular time/location) from the most recent round
  useEffect(() => {
    if (!showExtraForm || !rounds.length) return;
    const latest = [...rounds].reverse().find((r) => r.scheduled_time || r.location);
    if (latest) {
      if (latest.scheduled_time && !extraTime) setExtraTime(latest.scheduled_time.slice(0, 5));
      if (latest.location && !extraLocation) setExtraLocation(latest.location);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showExtraForm]);

  const today = new Date().toISOString().slice(0, 10);

  const formatDate = (d: string | null) => {
    if (!d) return "Sem data";
    return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  };

  const getStatus = (r: any) => {
    if (r.status === "scheduled" && r.scheduled_date && r.scheduled_date <= today) return "pending_result";
    return r.status;
  };

  const statusLabel = (s: string) => ({
    scheduled: "Agendada", pending_result: "Lançar resultado", in_progress: "Em jogo",
    completed: "Encerrada", cancelled: "Cancelada",
  } as any)[s] || s;

  const statusClass = (s: string) => ({
    scheduled: "bg-info/10 text-info", pending_result: "bg-warning/10 text-warning",
    in_progress: "bg-warning/10 text-warning", completed: "bg-success/10 text-success",
    cancelled: "bg-destructive/10 text-destructive",
  } as any)[s] || "bg-muted text-muted-foreground";

  const saveDate = async (id: string) => {
    const newDate = editDates[id];
    if (!newDate) return;
    setSaving(true);
    const { error } = await supabase.from("rounds").update({ scheduled_date: newDate }).eq("id", id);
    if (error) toast.error("Erro ao salvar data");
    else { toast.success("Data atualizada"); setEditingRoundId(null); refresh(); }
    setSaving(false);
  };

  const cancelRound = async (id: string) => {
    if (!window.confirm("Cancelar esta rodada?")) return;
    setSaving(true);
    const { error } = await supabase.from("rounds").update({ status: "cancelled" }).eq("id", id);
    if (error) toast.error("Erro ao cancelar");
    else { toast.success("Rodada cancelada"); refresh(); }
    setSaving(false);
  };

  const createExtraRound = async () => {
    if (!extraDate) { toast.error("Selecione uma data"); return; }
    if (!user) { toast.error("Faça login primeiro"); return; }
    setCreatingExtra(true);
    try {
      const result = await createExtraRoundFn({
        groupId,
        seasonId,
        actorId: user.id,
        scheduledDate: extraDate,
        scheduledTime: extraTime || null,
        location: extraLocation || null,
      });
      const { describePushResult } = await import("@/lib/notify");
      toast.success("Rodada extra criada", { description: describePushResult(result.push) });
      setShowExtraForm(false);
      setExtraDate("");
      setExtraTime("");
      setExtraLocation("");
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar rodada extra");
    } finally {
      setCreatingExtra(false);
    }
  };

  /**
   * Open the manual push dialog (admin). Validates the 12h window first.
   * The actual send happens from the dialog, with a custom message.
   */
  const openPushDialog = (r: any) => {
    if (!user) return;
    if (!r.scheduled_date) { toast.error("Rodada sem data agendada"); return; }
    const eventTs = new Date(`${r.scheduled_date}T${(r.scheduled_time || "00:00:00").slice(0, 8)}`).getTime();
    const hoursAway = (eventTs - Date.now()) / 3_600_000;
    if (hoursAway > 12) {
      toast.error("Push só pode ser enviado a partir de 12h antes da rodada", {
        description: `Faltam ${Math.ceil(hoursAway)}h para a rodada.`,
      });
      return;
    }
    const formatted = new Date(r.scheduled_date + "T00:00:00").toLocaleDateString("pt-BR", {
      weekday: "short", day: "2-digit", month: "short",
    });
    const timeText = r.scheduled_time ? ` às ${r.scheduled_time.slice(0, 5)}` : "";
    setPushMessage(`Rodada ${r.round_number} ${formatted}${timeText}. Confirme presença!`);
    setPushTargetRound(r);
  };

  const confirmSendPush = async () => {
    if (!user || !pushTargetRound) return;
    const r = pushTargetRound;
    const message = pushMessage.trim();
    if (!message) { toast.error("Mensagem não pode estar vazia"); return; }
    setSendingPush(true);
    try {
      const { data: group } = await supabase.from("groups").select("name").eq("id", groupId).single();
      const { notifyGroupMembers, describePushResult } = await import("@/lib/notify");
      const push = await notifyGroupMembers({
        groupId,
        actorId: user.id,
        type: "round_reminder",
        title: `${group?.name || "Rodada"} · Rodada ${r.round_number}`,
        body: message,
        url: `/groups/${groupId}?view=seasons&season=${seasonId}&round=${r.id}`,
        data: { roundId: r.id, seasonId, groupId },
        tag: `round_reminder:${r.id}:${Date.now()}`,
        includeActor: true, // admin also receives confirmation push
      });
      if (push.error) {
        toast.error("Falha ao enviar push", { description: describePushResult(push) });
      } else if (push.sent === 0) {
        toast.warning("Push enviado com problemas", { description: describePushResult(push) });
      } else {
        toast.success("Push enviado", { description: describePushResult(push) });
      }
      setPushTargetRound(null);
      setPushMessage("");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar push");
    } finally {
      setSendingPush(false);
    }
  };

  const extraRoundUI = isAdmin && (
    <div className="pt-1">
      {showExtraForm ? (
        <div className="rounded-xl border border-primary/30 bg-card/50 p-3 space-y-2">
          <div>
            <h4 className="text-xs font-semibold text-foreground">Nova rodada extra</h4>
            <p className="text-[11px] text-muted-foreground">Adicione uma rodada fora do calendário (ex: feriado).</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={extraDate}
              onChange={(e) => setExtraDate(e.target.value)}
              placeholder="Data"
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
            />
            <input
              type="time"
              value={extraTime}
              onChange={(e) => setExtraTime(e.target.value)}
              placeholder="Horário (opcional)"
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
            />
          </div>
          <input
            type="text"
            value={extraLocation}
            onChange={(e) => setExtraLocation(e.target.value)}
            placeholder="Local (opcional)"
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          />
          <div className="flex gap-2">
            <button
              onClick={createExtraRound}
              disabled={creatingExtra || !extraDate}
              className="flex-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {creatingExtra ? "Criando..." : "Criar rodada"}
            </button>
            <button
              onClick={() => { setShowExtraForm(false); setExtraDate(""); setExtraTime(""); setExtraLocation(""); }}
              className="rounded-lg bg-muted px-2.5 py-1.5 text-[11px]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowExtraForm(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card/30 px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Adicionar rodada extra
        </button>
      )}
    </div>
  );

  if (isLoading) return <div className="p-4 text-xs text-muted-foreground">Carregando rodadas…</div>;
  if (!rounds.length) {
    return (
      <div className="space-y-2 p-3">
        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-3 text-center text-xs text-muted-foreground">
          Nenhuma rodada criada.
        </div>
        {extraRoundUI}
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setEditing(!editing)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              editing ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {editing ? <><X className="h-3 w-3" /> Sair edição</> : <><Settings className="h-3 w-3" /> Editar rodadas</>}
          </button>
        </div>
      )}
      {rounds.map((r) => {
        const cancelled = r.status === "cancelled";
        const completed = r.status === "completed";
        const smartStatus = getStatus(r);
        const isExpanded = expandedId === r.id;
        return (
          <div key={r.id} id={`round-${r.id}`} className={`rounded-xl border border-border bg-card/40 ${cancelled ? "opacity-50" : ""}`}>
            {!cancelled ? (
              <div className="flex w-full items-center justify-between gap-3 p-3 hover:bg-accent/30">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="flex flex-1 min-w-0 items-center gap-2.5 text-left"
                  aria-expanded={isExpanded}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <span className="font-display text-xs font-bold text-primary">R{r.round_number || "?"}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">Rodada {r.round_number}</span>
                      {(r as any).is_extra && (
                        <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-warning" title="Rodada extra (fora do calendário regular)">
                          Extra
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(r.scheduled_date)}</span>
                      {r.scheduled_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.scheduled_time.slice(0, 5)}</span>}
                      {r.location && <span className="flex items-center gap-1 truncate max-w-[10rem]"><MapPin className="h-3 w-3" />{r.location}</span>}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && !completed && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openPushDialog(r); }}
                      className="flex h-7 items-center gap-1 rounded-full border border-border bg-card px-2 text-[10px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
                      title="Enviar push de lembrete (a partir de 12h antes)"
                    >
                      <Bell className="h-3 w-3" /> Push
                    </button>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(smartStatus)}`}>
                    {statusLabel(smartStatus)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    aria-label={isExpanded ? "Recolher" : "Expandir"}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <span className="font-display text-xs font-bold text-muted-foreground">R{r.round_number}</span>
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground line-through">Rodada {r.round_number}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(r.status)}`}>
                  {statusLabel(r.status)}
                </span>
              </div>
            )}

            {isExpanded && !cancelled && (
              <RoundExpandedDetails groupId={groupId} seasonId={seasonId} roundId={r.id} isAdmin={isAdmin} onChanged={refresh} />
            )}

            {editing && !cancelled && !completed && (
              <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                {editingRoundId === r.id ? (
                  <>
                    <input
                      type="date"
                      value={editDates[r.id] || r.scheduled_date || ""}
                      onChange={(e) => setEditDates((p) => ({ ...p, [r.id]: e.target.value }))}
                      className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-xs"
                    />
                    <button onClick={() => saveDate(r.id)} disabled={saving} className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">Salvar</button>
                    <button onClick={() => setEditingRoundId(null)} className="rounded-lg bg-muted px-2.5 py-1 text-[11px]">Cancelar</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditingRoundId(r.id); setEditDates((p) => ({ ...p, [r.id]: r.scheduled_date || "" })); }} className="flex items-center gap-1 rounded-lg bg-info/10 px-2.5 py-1 text-[11px] font-semibold text-info">
                      <Pencil className="h-3 w-3" /> Alterar data
                    </button>
                    <button onClick={() => cancelRound(r.id)} disabled={saving} className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive">
                      <Ban className="h-3 w-3" /> Cancelar
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      {extraRoundUI}

      {pushTargetRound && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => !sendingPush && setPushTargetRound(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold text-foreground">Enviar push manual</h3>
                <p className="text-[11px] text-muted-foreground">
                  Rodada {pushTargetRound.round_number} · você também receberá uma cópia para confirmar a entrega.
                </p>
              </div>
              <button
                onClick={() => setPushTargetRound(null)}
                disabled={sendingPush}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Mensagem
              </label>
              <textarea
                value={pushMessage}
                onChange={(e) => setPushMessage(e.target.value.slice(0, 240))}
                rows={3}
                placeholder="Ex.: Quadra trocada para Central Pádel"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">{pushMessage.length}/240</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                "Confirme presença!",
                "Quadra trocada — confira o local",
                "Horário ajustado — veja a rodada",
                "Faltam jogadores, confirmem!",
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPushMessage(preset)}
                  className="rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-[10px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setPushTargetRound(null)}
                disabled={sendingPush}
                className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={confirmSendPush}
                disabled={sendingPush || !pushMessage.trim()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                <Bell className="h-3.5 w-3.5" />
                {sendingPush ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoundExpandedDetails({
  groupId,
  seasonId,
  roundId,
  isAdmin,
  onChanged,
}: {
  groupId: string;
  seasonId: string;
  roundId: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [presence, setPresence] = useState<{ confirmed: number; declined: number; pending: number; max: number }>({
    confirmed: 0, declined: 0, pending: 0, max: 0,
  });
  const [matchesData, setMatchesData] = useState<any[]>([]);
  const [eloDeltas, setEloDeltas] = useState<Record<string, Record<string, { delta: number; before: number; after: number }>>>({});
  const [confirmedPlayers, setConfirmedPlayers] = useState<{ user_id: string; name: string; avatar_url: string | null }[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [myStatus, setMyStatus] = useState<"confirmed" | "declined" | "absent" | null>(null);
  const [groupFormat, setGroupFormat] = useState<"singles" | "doubles">("doubles");
  const [setsPerMatch, setSetsPerMatch] = useState<number>(3);
  const [setsMode, setSetsMode] = useState<"fixed" | "flexible" | "unlimited">("fixed");
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null);
  const [adminPresenceOpen, setAdminPresenceOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: round }, { data: pres }, { data: ms }, { data: members }, { data: season }, { data: group }] = await Promise.all([
        supabase.from("rounds").select("max_players, group_id, status, scheduled_date, scheduled_time, match_format").eq("id", roundId).maybeSingle(),
        supabase.from("round_presence").select("user_id, status, confirmed_at").eq("round_id", roundId),
        supabase.from("matches").select("id, status, match_number, winner_team, match_players(user_id, team), match_sets(set_number, score_team_a, score_team_b)").eq("round_id", roundId).order("match_number", { ascending: true }),
        supabase.from("group_members").select("user_id").eq("group_id", groupId).eq("status", "active"),
        supabase.from("seasons").select("sets_per_match, sets_mode, match_format").eq("id", seasonId).maybeSingle(),
        supabase.from("groups").select("match_format, singles_group_type").eq("id", groupId).maybeSingle(),
      ]);
      if (cancelled) return;
      const confirmedRows = (pres || []).filter((p) => p.status === "confirmed");
      const declined = (pres || []).filter((p) => p.status === "declined" || p.status === "absent").length;
      const respondedCount = (pres || []).length;
      const pendingCount = Math.max(0, (members?.length || 0) - respondedCount);
      setPresence({
        confirmed: confirmedRows.length,
        declined,
        pending: pendingCount,
        max: round?.max_players || 0,
      });
      setMatchesData(ms || []);
      setRoundStatus((round?.status as any) || "scheduled");

      const fmt = (round?.match_format || season?.match_format || group?.match_format || "doubles") as string;
      setGroupFormat(fmt === "singles" || fmt === "1v1" ? "singles" : "doubles");

      // Rivalry override: regardless of season config, rivalry groups always
      // play unlimited sets (the duel runs as long as players want).
      const isRivalry =
        group?.match_format === "singles" && group?.singles_group_type === "rivalry";
      setIsRivalry(isRivalry);
      if (isRivalry) {
        setSetsPerMatch(99);
        setSetsMode("unlimited");
      } else {
        if (season?.sets_per_match) setSetsPerMatch(season.sets_per_match);
        if (season?.sets_mode) setSetsMode(season.sets_mode as any);
      }


      const mine = user ? (pres || []).find((p) => p.user_id === user.id) : null;
      setMyStatus((mine?.status as any) ?? null);

      const sorted = [...confirmedRows].sort(
        (a, b) => new Date(b.confirmed_at || 0).getTime() - new Date(a.confirmed_at || 0).getTime()
      );
      setConfirmedIds(sorted.map((p) => p.user_id));
      const allIds = new Set<string>(sorted.map((p) => p.user_id));
      const matchIds: string[] = [];
      for (const m of (ms || [])) {
        matchIds.push((m as any).id);
        for (const mp of ((m as any).match_players || [])) allIds.add(mp.user_id);
      }

      // Fetch Elo before/after for all completed matches in this round
      let deltaMap: Record<string, Record<string, { delta: number; before: number; after: number }>> = {};
      if (matchIds.length) {
        const { data: events } = await supabase
          .from("rating_events")
          .select("match_id, user_id, rating_change, rating_before, rating_after")
          .in("match_id", matchIds);
        for (const ev of (events || [])) {
          const mid = (ev as any).match_id as string;
          const uid = (ev as any).user_id as string;
          if (!deltaMap[mid]) deltaMap[mid] = {};
          deltaMap[mid][uid] = {
            delta: Number((ev as any).rating_change) || 0,
            before: Number((ev as any).rating_before) || 0,
            after: Number((ev as any).rating_after) || 0,
          };
        }
      }
      if (cancelled) return;
      setEloDeltas(deltaMap);
      setScheduledDate(round?.scheduled_date ?? null);

      if (allIds.size) {
        const { data: profs } = await supabase
          .from("user_profiles")
          .select("user_id, name, nickname, avatar_url")
          .in("user_id", Array.from(allIds));
        if (cancelled) return;
        const map = new Map((profs || []).map((p) => [p.user_id, p]));
        setConfirmedPlayers(
          sorted.slice(0, 12).map((p) => {
            const prof = map.get(p.user_id);
            return {
              user_id: p.user_id,
              name: prof?.nickname || prof?.name || "Jogador",
              avatar_url: prof?.avatar_url ?? null,
            };
          })
        );
        setMatchesData((prev) => prev.map((m: any) => ({
          ...m,
          match_players: (m.match_players || []).map((mp: any) => ({ ...mp, profile: map.get(mp.user_id) })),
        })));
      } else {
        setConfirmedPlayers([]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [roundId, groupId, seasonId, user, reloadKey]);

  const handleConfirm = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { confirmPresence } = await import("@/hooks/use-seasons");
      await confirmPresence(roundId, user.id);
      toast.success("Presença confirmada!");
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao confirmar");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { cancelPresence } = await import("@/hooks/use-seasons");
      await cancelPresence(roundId, user.id);
      toast.success("Presença cancelada");
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao cancelar");
    } finally {
      setBusy(false);
    }
  };

  const handleDrawTeams = async () => {
    if (!user) return;
    const minPlayers = groupFormat === "singles" ? 2 : 4;
    if (confirmedIds.length < minPlayers) {
      toast.error(`Mínimo ${minPlayers} jogadores confirmados`);
      return;
    }
    setBusy(true);
    try {
      const { drawTeams } = await import("@/lib/round-actions");
      await drawTeams(roundId, confirmedIds, user.id);
      toast.success("Times sorteados");
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao sortear");
    } finally {
      setBusy(false);
    }
  };

  const hasUnstartedMatches = matchesData.length > 0
    && matchesData.every((m: any) => (m.match_sets || []).length === 0 && m.status !== "completed" && m.status !== "in_progress");

  const handleRedrawTeams = async () => {
    if (!user) return;
    if (!hasUnstartedMatches) return;
    if (!window.confirm("Apagar todos os times atuais e sortear novamente?")) return;
    setBusy(true);
    try {
      const matchIds = matchesData.map((m: any) => m.id);
      await supabase.from("match_players").delete().in("match_id", matchIds);
      await supabase.from("matches").delete().in("id", matchIds);
      const { drawTeams } = await import("@/lib/round-actions");
      await drawTeams(roundId, confirmedIds, user.id);
      toast.success("Times sorteados novamente");
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao resortear");
    } finally {
      setBusy(false);
    }
  };

  const scoringMatch = scoringMatchId ? matchesData.find((m) => m.id === scoringMatchId) : null;

  return (
    <div className="border-t border-border bg-background/40 p-3 space-y-3">
      {loading ? (
        <div className="text-[11px] text-muted-foreground">Carregando…</div>
      ) : (
        <>
          {user && (
            <div>
              {myStatus === "confirmed" ? (
                <button
                  onClick={handleCancel}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 py-2 text-xs font-semibold text-destructive disabled:opacity-50"
                >
                  Cancelar presença
                </button>
              ) : (
                <button
                  onClick={handleConfirm}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  Confirmar presença
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Confirmados" value={`${presence.confirmed}/${presence.max || "—"}`} tone="success" />
            <Stat label="Recusados" value={String(presence.declined)} tone="muted" />
            <Stat label="Sem resposta" value={String(presence.pending)} tone="warning" />
            <Stat label="Partidas" value={String(matchesData.length)} tone="primary" />
          </div>

          {confirmedPlayers.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Confirmados
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {confirmedPlayers.map((p) => (
                  <div key={p.user_id} title={p.name} className="group/avatar relative">
                    <PlayerAvatarLink userId={p.user_id} ariaLabel={`Ver perfil de ${p.name}`}>
                      <PlayerAvatar avatarUrl={p.avatar_url} name={p.name} size="md" className="ring-1 ring-success/40 cursor-pointer transition-transform hover:scale-110" />
                    </PlayerAvatarLink>
                    <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-0.5 text-[10px] font-semibold text-foreground opacity-0 shadow-md transition-opacity group-hover/avatar:opacity-100">
                      {p.name}
                    </span>
                  </div>
                ))}
                {presence.confirmed > confirmedPlayers.length && (
                  <span className="ml-1 rounded-full border border-border bg-card px-2 py-1 text-[10px] font-bold text-muted-foreground">
                    +{presence.confirmed - confirmedPlayers.length}
                  </span>
                )}
              </div>
            </div>
          )}

      {/* Admin: add members to presence list (in-person sign-up) */}
          {isAdmin && matchesData.length === 0 && (
            <button
              onClick={() => setAdminPresenceOpen(true)}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 py-2 text-xs font-semibold text-foreground hover:bg-muted/60 disabled:opacity-50"
              title="Adicionar membros à lista de presença em nome deles"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Adicionar à lista
            </button>
          )}

      {/* Admin: sortear times when there are no matches yet */}
          {isAdmin && matchesData.length === 0 && (
            <button
              onClick={handleDrawTeams}
              disabled={busy || confirmedIds.length < (groupFormat === "singles" ? 2 : 4)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 py-2 text-xs font-bold text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              Sortear times ({confirmedIds.length} confirmados)
            </button>
          )}

          {/* Admin: resortear times when matches exist but no result entered */}
          {isAdmin && hasUnstartedMatches && (
            <button
              onClick={handleRedrawTeams}
              disabled={busy || confirmedIds.length < (groupFormat === "singles" ? 2 : 4)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-warning/30 bg-warning/10 py-2 text-xs font-bold text-warning hover:bg-warning/20 disabled:opacity-50"
              title="Apaga os times atuais (nenhum resultado lançado) e sorteia novamente"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Resortear times
            </button>
          )}

          {/* Mini Elo timeline of the day */}
          <RoundEloMiniTimeline
            seasonId={seasonId}
            scheduledDate={scheduledDate}
            matchPlayerIds={Array.from(new Set(matchesData.flatMap((m: any) => (m.match_players || []).map((mp: any) => mp.user_id))))}
            visible={matchesData.some((m: any) => (m.match_sets || []).length > 0)}
          />

          {/* Matches summary with inline result entry + Elo before/after */}
          {matchesData.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Partidas
              </p>
              <div className="space-y-1.5">
                {matchesData.map((m: any) => {
                  const teamA = (m.match_players || []).filter((mp: any) => mp.team === "A");
                  const teamB = (m.match_players || []).filter((mp: any) => mp.team === "B");
                  const sets = (m.match_sets || []).slice().sort((a: any, b: any) => a.set_number - b.set_number);
                  const nameOf = (mp: any) => (mp.profile?.nickname || mp.profile?.name || "Jogador");
                  const deltas = eloDeltas[m.id] || {};
                  const renderTeam = (team: any[], side: "A" | "B") => (
                    <span className={m.winner_team === side ? "font-bold text-primary" : "text-foreground"}>
                      {team.length === 0 ? "—" : team.map((mp) => {
                        const ev = deltas[mp.user_id];
                        return (
                          <span key={mp.user_id} className="inline-flex items-baseline gap-1 mr-1">
                            <span>{nameOf(mp)}</span>
                            {ev && ev.delta !== 0 && (
                              <span className="inline-flex items-baseline gap-0.5 text-[9px] font-bold tabular-nums">
                                <span className="text-muted-foreground">{Math.round(ev.before)}</span>
                                <span className={ev.delta > 0 ? "text-success" : "text-destructive"}>→{Math.round(ev.after)}</span>
                                <span className={`${ev.delta > 0 ? "text-success" : "text-destructive"}`}>({ev.delta > 0 ? "+" : ""}{Math.round(ev.delta)})</span>
                              </span>
                            )}
                          </span>
                        );
                      }).reduce((acc: any, el: any, i: number) => i === 0 ? [el] : [...acc, <span key={`sep${i}`} className="text-muted-foreground">/ </span>, el], [] as any)}
                    </span>
                  );
                  const iAmInMatch = !!user && (m.match_players || []).some((mp: any) => mp.user_id === user.id);
                  const canEnterScore = isAdmin || iAmInMatch;
                  const showEnterBtn = canEnterScore && m.status !== "completed";
                  return (
                    <div key={m.id} className="rounded-lg border border-border bg-card/40 px-2 py-1.5 text-[11px] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1 truncate">
                          {renderTeam(teamA, "A")}
                          <span className="text-muted-foreground"> vs </span>
                          {renderTeam(teamB, "B")}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {sets.length > 0 ? sets.map((s: any) => (
                            <span key={s.set_number} className="rounded bg-muted px-1.5 py-0.5 font-display font-bold tabular-nums">
                              {s.score_team_a}-{s.score_team_b}
                            </span>
                          )) : (
                            <span className="rounded-full bg-info/10 px-1.5 py-0.5 text-[9px] font-semibold text-info">
                              {m.status === "scheduled" ? "Agendada" : "Em andamento"}
                            </span>
                          )}
                        </div>
                      </div>
                      {showEnterBtn && (
                        <button
                          onClick={() => setScoringMatchId(m.id)}
                          className="flex w-full items-center justify-center gap-1 rounded-md border border-primary/30 bg-primary/5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10"
                        >
                          <Trophy className="h-3 w-3" />
                          {sets.length > 0 ? "Editar resultado" : (isAdmin ? "Lançar resultado" : "Enviar resultado")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {scoringMatch && (() => {
            const teamA = (scoringMatch.match_players || []).filter((mp: any) => mp.team === "A").map((mp: any) => ({
              name: mp.profile?.nickname || mp.profile?.name || "Jogador",
              avatarUrl: mp.profile?.avatar_url || undefined,
              userId: mp.user_id,
            }));
            const teamB = (scoringMatch.match_players || []).filter((mp: any) => mp.team === "B").map((mp: any) => ({
              name: mp.profile?.nickname || mp.profile?.name || "Jogador",
              avatarUrl: mp.profile?.avatar_url || undefined,
              userId: mp.user_id,
            }));
            const existingSets = (scoringMatch.match_sets || [])
              .slice()
              .sort((a: any, b: any) => a.set_number - b.set_number)
              .map((s: any) => ({ setNumber: s.set_number, scoreA: s.score_team_a, scoreB: s.score_team_b }));
            return (
              <ScoreEntryDialog
                matchId={scoringMatch.id}
                seasonId={seasonId}
                matchNumber={scoringMatch.match_number || 1}
                teamA={teamA}
                teamB={teamB}
                existingSets={existingSets}
                setsPerMatch={setsPerMatch}
                setsMode={setsMode}
                isSingles={groupFormat === "singles"}
                isAdmin={isAdmin}
                onClose={() => setScoringMatchId(null)}
                onSaved={() => {
                  setScoringMatchId(null);
                  setReloadKey((k) => k + 1);
                  onChanged();
                }}
              />
            );
          })()}

          <AdminAddPresenceDialog
            open={adminPresenceOpen}
            onOpenChange={setAdminPresenceOpen}
            roundId={roundId}
            groupId={groupId}
            alreadyConfirmedIds={confirmedIds}
            onAdded={() => setReloadKey((k) => k + 1)}
          />
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "success" | "muted" | "warning" | "primary" }) {
  const toneClass = {
    success: "text-success",
    muted: "text-muted-foreground",
    warning: "text-warning",
    primary: "text-primary",
  }[tone];
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-display text-base font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

/**
 * Mini Elo chart for the round: shows the average rating trajectory of the
 * players involved across the season, with a marker on the round's day.
 */
function RoundEloMiniTimeline({
  seasonId,
  scheduledDate,
  matchPlayerIds,
  visible,
}: {
  seasonId: string;
  scheduledDate: string | null;
  matchPlayerIds: string[];
  visible: boolean;
}) {
  const [points, setPoints] = useState<{ date: string; avg: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !matchPlayerIds.length) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("rating_events")
        .select("created_at, rating_after, user_id")
        .eq("season_id", seasonId)
        .in("user_id", matchPlayerIds)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      // Bucket per day, average rating_after across the involved players (last value of the day per user)
      const byDayUser = new Map<string, Map<string, number>>();
      for (const ev of (data || [])) {
        const day = String((ev as any).created_at).slice(0, 10);
        if (!byDayUser.has(day)) byDayUser.set(day, new Map());
        byDayUser.get(day)!.set((ev as any).user_id, Number((ev as any).rating_after) || 0);
      }
      // Carry-forward across days for missing users
      const days = [...byDayUser.keys()].sort();
      const lastByUser = new Map<string, number>();
      const out: { date: string; avg: number }[] = [];
      for (const d of days) {
        const m = byDayUser.get(d)!;
        for (const [uid, r] of m) lastByUser.set(uid, r);
        const vals = matchPlayerIds.map((u) => lastByUser.get(u)).filter((v): v is number => typeof v === "number");
        if (vals.length) out.push({ date: d, avg: vals.reduce((a, b) => a + b, 0) / vals.length });
      }
      setPoints(out);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [seasonId, visible, matchPlayerIds.join(","), scheduledDate]);

  if (!visible || loading || points.length < 2) return null;

  const w = 280, h = 60, pad = 4;
  const min = Math.min(...points.map((p) => p.avg));
  const max = Math.max(...points.map((p) => p.avg));
  const range = Math.max(1, max - min);
  const xs = (i: number) => pad + (i / (points.length - 1)) * (w - 2 * pad);
  const ys = (v: number) => h - pad - ((v - min) / range) * (h - 2 * pad);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(p.avg).toFixed(1)}`).join(" ");
  const todayIdx = scheduledDate ? points.findIndex((p) => p.date === scheduledDate) : -1;
  const last = points[points.length - 1];
  const first = points[0];
  const dayDelta = todayIdx > 0 ? points[todayIdx].avg - points[todayIdx - 1].avg : 0;

  return (
    <div className="rounded-xl border border-border bg-card/40 p-2.5">
      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="font-bold uppercase tracking-wider text-muted-foreground">Elo médio (jogadores da rodada)</span>
        {todayIdx >= 0 && dayDelta !== 0 && (
          <span className={`font-bold tabular-nums ${dayDelta > 0 ? "text-success" : "text-destructive"}`}>
            {dayDelta > 0 ? "+" : ""}{Math.round(dayDelta)} no dia
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
        {todayIdx >= 0 && (
          <>
            <line x1={xs(todayIdx)} y1={pad} x2={xs(todayIdx)} y2={h - pad} stroke="hsl(var(--warning))" strokeDasharray="2 2" strokeWidth="1" />
            <circle cx={xs(todayIdx)} cy={ys(points[todayIdx].avg)} r="2.5" fill="hsl(var(--warning))" />
          </>
        )}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground tabular-nums">
        <span>{Math.round(first.avg)}</span>
        <span>{Math.round(last.avg)}</span>
      </div>
    </div>
  );
}
