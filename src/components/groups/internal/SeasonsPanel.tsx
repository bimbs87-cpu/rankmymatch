import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  Trophy, Calendar, Plus, ChevronRight, ChevronDown, CircleDot, CheckCircle2,
  Clock, MapPin, Pencil, Ban, X, Settings,
} from "lucide-react";
import { useGroupSeasons } from "@/hooks/use-seasons";
import { useSeasonRounds } from "@/hooks/use-rounds";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  groupId: string;
  isAdmin: boolean;
}

export function SeasonsPanel({ groupId, isAdmin }: Props) {
  const { seasons, isLoading } = useGroupSeasons(groupId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auto-expand active season on first load
  useEffect(() => {
    if (!expandedId && seasons.length) {
      const active = seasons.find((s) => s.status === "active");
      if (active) setExpandedId(active.id);
    }
  }, [seasons, expandedId]);

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
  season, groupId, isAdmin, expanded, onToggle,
}: {
  season: any; groupId: string; isAdmin: boolean; expanded: boolean; onToggle: () => void;
}) {
  const isActive = season.status === "active";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-card"
      >
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
          isActive ? "bg-primary/15 text-primary" : "bg-muted/40 text-muted-foreground"
        }`}>
          <Trophy className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate font-display text-sm font-bold text-foreground">{season.name}</h4>
            {isActive && (
              <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">
                Ativa
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(season.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })}
            </span>
            <span>·</span>
            <span>{season.match_format === "1v1" ? "Singles" : "Duplas"}</span>
            {season.total_rounds && (<><span>·</span><span>{season.total_rounds} rodadas</span></>)}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t border-border bg-background/40">
          <SeasonRoundsInline groupId={groupId} seasonId={season.id} isAdmin={isAdmin} />
        </div>
      )}
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
