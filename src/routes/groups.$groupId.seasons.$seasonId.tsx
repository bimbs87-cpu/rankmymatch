import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGroupDetail } from "@/hooks/use-groups";
import { useSeasonRounds, createRound } from "@/hooks/use-seasons";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, Calendar, MapPin, Clock, Users, X } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/groups/$groupId/seasons/$seasonId")({
  component: SeasonDetailPage,
});

function SeasonDetailPage() {
  const { groupId, seasonId } = Route.useParams();
  const { user } = useAuth();
  const { isAdmin } = useGroupDetail(groupId);
  const { rounds, isLoading, refresh } = useSeasonRounds(seasonId);
  const [seasonName, setSeasonName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [location, setLocation] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [submitting, setSubmitting] = useState(false);

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

  const handleCreate = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      await createRound({
        groupId,
        seasonId,
        roundNumber: rounds.length + 1,
        scheduledDate: date || undefined,
        scheduledTime: time || undefined,
        location: location.trim() || undefined,
        maxPlayers,
        userId: user.id,
      });
      toast.success("Rodada criada!");
      setShowCreate(false);
      setDate("");
      setLocation("");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar rodada");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "Sem data";
    return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
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
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Rodada
            </button>
          )}
        </div>
      </header>

      <div className="space-y-3 px-5">
        {rounds.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground/40" />
              <h3 className="font-display text-base font-bold text-foreground">Nenhuma rodada</h3>
              <p className="text-sm text-muted-foreground">
                {isAdmin ? "Crie a primeira rodada." : "Aguarde o admin criar rodadas."}
              </p>
            </div>
          </div>
        ) : (
          rounds.map((r) => (
            <Link
              key={r.id}
              to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
              params={{ groupId, seasonId, roundId: r.id }}
              className="flex items-center justify-between rounded-2xl border border-border bg-card/50 p-4 transition-colors active:bg-accent/30"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <span className="font-display text-sm font-bold text-primary">
                    R{r.round_number || "?"}
                  </span>
                </div>
                <div>
                  <span className="text-sm font-semibold text-foreground">
                    Rodada {r.round_number}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(r.scheduled_date)}</span>
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
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                  r.status === "scheduled"
                    ? "bg-info/10 text-info"
                    : r.status === "in_progress"
                    ? "bg-warning/10 text-warning"
                    : "bg-success/10 text-success"
                }`}
              >
                {r.status === "scheduled" ? "Agendada" : r.status === "in_progress" ? "Em jogo" : "Encerrada"}
              </span>
            </Link>
          ))
        )}
      </div>

      {/* Create round dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-border bg-card p-6 pb-10 sm:pb-6 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-lg font-bold text-foreground">Nova Rodada</h2>
              <button onClick={() => setShowCreate(false)} className="rounded-full bg-muted p-2">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Horário</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Local</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex: Quadra Central"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  <Users className="mr-1 inline h-3.5 w-3.5" />
                  Máx. jogadores
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={4}
                    max={32}
                    step={2}
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-10 text-center font-display text-lg font-bold text-foreground">{maxPlayers}</span>
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {submitting ? "Criando..." : "Criar Rodada"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
