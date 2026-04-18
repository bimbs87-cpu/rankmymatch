import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Trophy, Calendar, Plus, ChevronRight, ChevronDown, CircleDot, CheckCircle2,
  Clock, MapPin, Pencil, Ban, X, Settings, Check, Flag, RotateCcw, Trash2,
} from "lucide-react";
import { useGroupSeasons } from "@/hooks/use-seasons";
import { useSeasonRounds } from "@/hooks/use-rounds";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SeasonFinalRanking } from "./SeasonFinalRanking";

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
}

export function SeasonsPanel({ groupId, isAdmin }: Props) {
  const { seasons, isLoading, refresh } = useGroupSeasons(groupId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const active = seasons.filter((s) => s.status === "active");
  const finished = seasons.filter((s) => s.status !== "active");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Temporadas</h2>
          <p className="text-xs text-muted-foreground">
            {seasons.length} {seasons.length === 1 ? "temporada criada" : "temporadas criadas"}
          </p>
        </div>
        {isAdmin && (
          <Link
            to="/groups/$groupId/seasons"
            params={{ groupId }}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Nova
          </Link>
        )}
      </div>

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
          {active.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-success">
                <CircleDot className="h-3 w-3" /> Em andamento
              </h3>
              {active.map((s) => (
                <SeasonAccordion
                  key={s.id}
                  season={s}
                  groupId={groupId}
                  isAdmin={isAdmin}
                  expanded={expandedId === s.id}
                  onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  onChanged={refresh}
                />
              ))}
            </section>
          )}

          {finished.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <CheckCircle2 className="h-3 w-3" /> Encerradas
              </h3>
              {finished.map((s) => (
                <SeasonAccordion
                  key={s.id}
                  season={s}
                  groupId={groupId}
                  isAdmin={isAdmin}
                  expanded={expandedId === s.id}
                  onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  onChanged={refresh}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SeasonAccordion({
  season, groupId, isAdmin, expanded, onToggle, onChanged,
}: {
  season: any; groupId: string; isAdmin: boolean; expanded: boolean; onToggle: () => void; onChanged: () => void;
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
          <SeasonRoundsInline groupId={groupId} seasonId={season.id} isAdmin={isAdmin} />
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
    else { toast.success("Temporada encerrada"); onChanged(); }
    setBusy(false);
  };

  const reopen = async () => {
    if (!window.confirm(`Reabrir "${season.name}"? A temporada voltará a ficar ativa.`)) return;
    setBusy(true);
    const { error } = await supabase.from("seasons").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", season.id);
    if (error) toast.error("Erro ao reabrir");
    else { toast.success("Temporada reaberta"); onChanged(); }
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

function SeasonRoundsInline({ groupId, seasonId, isAdmin }: { groupId: string; seasonId: string; isAdmin: boolean }) {
  const { rounds, isLoading, refresh } = useSeasonRounds(seasonId);
  const [editing, setEditing] = useState(false);
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [editDates, setEditDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

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

  if (isLoading) return <div className="p-4 text-xs text-muted-foreground">Carregando rodadas…</div>;
  if (!rounds.length) return <div className="p-4 text-xs text-muted-foreground">Nenhuma rodada criada.</div>;

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
        return (
          <div key={r.id} className={`rounded-xl border border-border bg-card/40 ${cancelled ? "opacity-50" : ""}`}>
            {!cancelled ? (
              <Link
                to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                params={{ groupId, seasonId, roundId: r.id }}
                className="flex items-center justify-between gap-3 p-3 hover:bg-accent/30"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <span className="font-display text-xs font-bold text-primary">R{r.round_number || "?"}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-foreground">Rodada {r.round_number}</span>
                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(r.scheduled_date)}</span>
                      {r.scheduled_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.scheduled_time.slice(0, 5)}</span>}
                      {r.location && <span className="flex items-center gap-1 truncate max-w-[10rem]"><MapPin className="h-3 w-3" />{r.location}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(smartStatus)}`}>
                    {statusLabel(smartStatus)}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </Link>
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
    </div>
  );
}
