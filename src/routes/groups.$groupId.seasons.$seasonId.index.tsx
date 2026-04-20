import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { useGroupDetail } from "@/hooks/use-groups";
import { useSeasonRounds } from "@/hooks/use-seasons";
import { supabase } from "@/integrations/supabase/client";
import { createExtraRound as createExtraRoundFn } from "@/lib/extra-round";
import { ArrowLeft, Calendar, MapPin, Clock, X, Pencil, Ban, Settings, ChevronRight, Plus } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/groups/$groupId/seasons/$seasonId/")({
  component: SeasonDetailPage,
});

function SeasonDetailPage() {
  const { groupId, seasonId } = Route.useParams();
  const { user } = useAuth();
  const { isAdmin } = useGroupDetail(groupId);
  const { rounds, isLoading, refresh } = useSeasonRounds(seasonId);
  const [seasonName, setSeasonName] = useState("");
  const [editing, setEditing] = useState(false);
  const [editDates, setEditDates] = useState<Record<string, string>>({});
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingExtra, setCreatingExtra] = useState(false);
  const [extraDate, setExtraDate] = useState("");
  const [extraTime, setExtraTime] = useState("");
  const [extraLocation, setExtraLocation] = useState("");
  const [showExtraForm, setShowExtraForm] = useState(false);

  useEffect(() => {
    supabase
      .from("seasons")
      .select("name")
      .eq("id", seasonId)
      .single()
      .then(({ data }) => {
        if (data) setSeasonName(data.name);
      });
  }, [seasonId]);

  const formatDate = (d: string | null) => {
    if (!d) return "Sem data";
    return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  };

  const today = new Date().toISOString().split("T")[0];

  const getSmartStatus = (round: typeof rounds[0]) => {
    if (round.status !== "scheduled") return round.status;
    if (round.scheduled_date && round.scheduled_date <= today) return "pending_result";
    return "scheduled";
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "scheduled": return "Agendada";
      case "pending_result": return "Lançar resultado";
      case "in_progress": return "Em jogo";
      case "completed": return "Encerrada";
      case "cancelled": return "Cancelada";
      default: return status;
    }
  };

  const statusClass = (status: string) => {
    switch (status) {
      case "scheduled": return "bg-info/10 text-info";
      case "pending_result": return "bg-warning/10 text-warning";
      case "in_progress": return "bg-warning/10 text-warning";
      case "completed": return "bg-success/10 text-success";
      case "cancelled": return "bg-destructive/10 text-destructive";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const handleDateChange = (roundId: string, newDate: string) => {
    setEditDates((prev) => ({ ...prev, [roundId]: newDate }));
  };

  const handleSaveDate = async (roundId: string) => {
    const newDate = editDates[roundId];
    if (!newDate) return;
    setSaving(true);
    const { error } = await supabase
      .from("rounds")
      .update({ scheduled_date: newDate })
      .eq("id", roundId);
    if (error) {
      toast.error("Erro ao salvar data");
    } else {
      toast.success("Data atualizada");
      setEditingRoundId(null);
      refresh();
    }
    setSaving(false);
  };

  const handleCancelRound = async (roundId: string) => {
    setSaving(true);
    const { error } = await supabase
      .from("rounds")
      .update({ status: "cancelled" })
      .eq("id", roundId);
    if (error) {
      toast.error("Erro ao cancelar rodada");
    } else {
      toast.success("Rodada cancelada");
      refresh();
    }
    setSaving(false);
  };

  const handleCreateExtraRound = async () => {
    if (!extraDate) {
      toast.error("Selecione uma data");
      return;
    }
    if (!user) {
      toast.error("Faça login primeiro");
      return;
    }
    setCreatingExtra(true);
    try {
      await createExtraRoundFn({
        groupId,
        seasonId,
        actorId: user.id,
        scheduledDate: extraDate,
        scheduledTime: extraTime || null,
        location: extraLocation || null,
      });
      toast.success("Rodada extra criada");
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

  if (isLoading) {
    return <TrophyLoadingBar />;
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <Link
            to="/groups/$groupId/seasons"
            params={{ groupId }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-foreground">{seasonName || "Temporada"}</h1>
            <p className="text-xs text-muted-foreground">{rounds.length} rodada{rounds.length !== 1 ? "s" : ""}</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setEditing(!editing)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                editing
                  ? "bg-warning/10 text-warning border border-warning/30"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {editing ? (
                <>
                  <X className="h-3.5 w-3.5" />
                  Fechar
                </>
              ) : (
                <>
                  <Settings className="h-3.5 w-3.5" />
                  Editar
                </>
              )}
            </button>
          )}
        </div>
      </header>

      <div className="space-y-2 px-5">
        {rounds.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="font-display text-base font-bold text-foreground">Nenhuma rodada</h3>
              <p className="text-sm text-muted-foreground">
                As rodadas serão criadas ao configurar a temporada.
              </p>
            </div>
          </div>
        ) : (
          rounds.map((r) => (
            <div key={r.id} className={`rounded-2xl border border-border bg-card/50 transition-colors ${r.status === "cancelled" ? "opacity-50" : ""}`}>
              {r.status !== "cancelled" ? (
                <Link
                  to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                  params={{ groupId, seasonId, roundId: r.id }}
                  className="flex items-center justify-between p-4 active:bg-accent/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <span className="font-display text-sm font-bold text-primary">
                        R{r.round_number || "?"}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">
                          Rodada {r.round_number}
                        </span>
                        {(r as any).is_extra && (
                          <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-warning" title="Rodada extra (fora do calendário regular)">
                            Extra
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{editingRoundId === r.id ? editDates[r.id] || r.scheduled_date : formatDate(r.scheduled_date)}</span>
                        {r.scheduled_time && (
                          <>
                            <Clock className="h-3 w-3" />
                            <span>{r.scheduled_time?.slice(0, 5)}</span>
                          </>
                        )}
                      </div>
                      {r.location && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{r.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusClass(getSmartStatus(r))}`}>
                      {statusLabel(getSmartStatus(r))}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ) : (
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                      <span className="font-display text-sm font-bold text-muted-foreground">
                        R{r.round_number || "?"}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-muted-foreground line-through">
                        Rodada {r.round_number}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(r.scheduled_date)}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusClass(r.status)}`}>
                    {statusLabel(r.status)}
                  </span>
                </div>
              )}

              {/* Edit controls */}
              {editing && r.status !== "cancelled" && r.status !== "completed" && (
                <div className="border-t border-border px-4 py-2.5 flex items-center gap-2">
                  {editingRoundId === r.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="date"
                        value={editDates[r.id] || r.scheduled_date || ""}
                        onChange={(e) => handleDateChange(r.id, e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => handleSaveDate(r.id)}
                        disabled={saving}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditingRoundId(null)}
                        className="rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingRoundId(r.id);
                          setEditDates((prev) => ({ ...prev, [r.id]: r.scheduled_date || "" }));
                        }}
                        className="flex items-center gap-1 rounded-lg bg-info/10 px-3 py-1.5 text-xs font-semibold text-info"
                      >
                        <Pencil className="h-3 w-3" />
                        Alterar data
                      </button>
                      <button
                        onClick={() => handleCancelRound(r.id)}
                        disabled={saving}
                        className="flex items-center gap-1 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-50"
                      >
                        <Ban className="h-3 w-3" />
                        Cancelar rodada
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {isAdmin && (
          <div className="pt-2">
            {showExtraForm ? (
              <div className="rounded-2xl border border-primary/30 bg-card/50 p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Nova rodada extra</h4>
                  <p className="text-xs text-muted-foreground">Adicione uma rodada fora do calendário regular (ex: feriado, jogo extra).</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={extraDate}
                    onChange={(e) => setExtraDate(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="time"
                    value={extraTime}
                    onChange={(e) => setExtraTime(e.target.value)}
                    placeholder="Horário"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <input
                  type="text"
                  value={extraLocation}
                  onChange={(e) => setExtraLocation(e.target.value)}
                  placeholder="Local (opcional)"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateExtraRound}
                    disabled={creatingExtra || !extraDate}
                    className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {creatingExtra ? "Criando..." : "Criar rodada"}
                  </button>
                  <button
                    onClick={() => { setShowExtraForm(false); setExtraDate(""); setExtraTime(""); setExtraLocation(""); }}
                    className="rounded-lg bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowExtraForm(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/30 px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Plus className="h-4 w-4" />
                Adicionar rodada extra
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
