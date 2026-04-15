import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGroupDetail } from "@/hooks/use-groups";
import { useRoundDetail, confirmPresence, cancelPresence, drawTeams, deleteMatch, deleteRound } from "@/hooks/use-seasons";
import { ScoreEntryDialog } from "@/components/ScoreEntryDialog";
import { ManualMatchDialog } from "@/components/ManualMatchDialog";
import {
  ArrowLeft,
  Check,
  X,
  Shuffle,
  Calendar,
  Clock,
  MapPin,
  Users,
  Swords,
  UserCheck,
  UserX,
  Edit3,
  PlusCircle,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/groups/$groupId/seasons/$seasonId/rounds/$roundId"
)({
  component: RoundDetailPage,
});

function RoundDetailPage() {
  const { groupId, seasonId, roundId } = Route.useParams();
  const { user } = useAuth();
  const { isAdmin } = useGroupDetail(groupId);
  const { round, presences, matches, myPresence, confirmedCount, isLoading, refresh } =
    useRoundDetail(roundId);
  const [scoringMatch, setScoringMatch] = useState<any>(null);
  const [showManualMatch, setShowManualMatch] = useState(false);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);

  const handleDeleteMatch = async (matchId: string) => {
    if (!confirm("Tem certeza que deseja apagar esta partida? Os dados de placar serão perdidos.")) return;
    setDeletingMatchId(matchId);
    try {
      await deleteMatch(matchId);
      toast.success("Partida apagada!");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Erro ao apagar partida");
    } finally {
      setDeletingMatchId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!round) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <h2 className="font-display text-lg font-bold text-foreground">Rodada não encontrada</h2>
      </div>
    );
  }

  const isConfirmed = myPresence?.status === "confirmed";
  const confirmedPlayers = presences.filter((p) => p.status === "confirmed");
  const canDraw = isAdmin && confirmedPlayers.length >= 4 && matches.length === 0;

  const handleConfirm = async () => {
    if (!user) return;
    try {
      await confirmPresence(roundId, user.id);
      toast.success("Presença confirmada!");
      refresh();
    } catch {
      toast.error("Erro ao confirmar");
    }
  };

  const handleCancel = async () => {
    if (!user) return;
    try {
      await cancelPresence(roundId, user.id);
      toast.success("Presença cancelada");
      refresh();
    } catch {
      toast.error("Erro ao cancelar");
    }
  };

  const handleDraw = async () => {
    try {
      const ids = confirmedPlayers.map((p) => p.user_id);
      await drawTeams(roundId, ids, user?.id);
      toast.success("Times sorteados!");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Erro no sorteio");
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "Sem data";
    return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <header className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <Link
            to="/groups/$groupId/seasons/$seasonId"
            params={{ groupId, seasonId }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-foreground">
              Rodada {round.round_number}
            </h1>
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                round.status === "scheduled" && round.scheduled_date && round.scheduled_date <= new Date().toISOString().split("T")[0]
                  ? "bg-warning/10 text-warning"
                  : round.status === "scheduled"
                  ? "bg-info/10 text-info"
                  : round.status === "in_progress"
                  ? "bg-warning/10 text-warning"
                  : "bg-success/10 text-success"
              }`}
            >
              {round.status === "scheduled" && round.scheduled_date && round.scheduled_date <= new Date().toISOString().split("T")[0]
                ? "Lançar resultado"
                : round.status === "scheduled" ? "Agendada" : round.status === "in_progress" ? "Em jogo" : "Encerrada"}
            </span>
          </div>
        </div>
      </header>

      {/* Info card */}
      <div className="mx-5 mb-4 rounded-2xl border border-border bg-card/50 p-4">
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {round.scheduled_date && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span className="capitalize">{formatDate(round.scheduled_date)}</span>
            </div>
          )}
          {round.scheduled_time && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>{round.scheduled_time.slice(0, 5)}</span>
            </div>
          )}
          {round.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              <span>{round.location}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span>{confirmedCount}/{round.max_players} confirmados</span>
          </div>
        </div>
      </div>

      {/* Presence buttons */}
      {round.status === "scheduled" && (
        <div className="mx-5 mb-5 flex gap-2">
          {isConfirmed ? (
            <button
              onClick={handleCancel}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 py-3 text-sm font-semibold text-destructive"
            >
              <UserX className="h-4 w-4" />
              Cancelar presença
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground"
            >
              <UserCheck className="h-4 w-4" />
              Confirmar presença
            </button>
          )}
        </div>
      )}

      {/* Draw button */}
      {canDraw && (
        <div className="mx-5 mb-5">
          <button
            onClick={handleDraw}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-primary/5 py-3.5 text-sm font-bold text-primary"
          >
            <Shuffle className="h-4 w-4" />
            Sortear Times ({confirmedPlayers.length} jogadores → {Math.floor(confirmedPlayers.length / 4)} partida{Math.floor(confirmedPlayers.length / 4) !== 1 ? "s" : ""})
          </button>
        </div>
      )}

      {/* Manual match creation for admins when no matches exist */}
      {isAdmin && matches.length === 0 && (
        <div className="mx-5 mb-5">
          <button
            onClick={() => setShowManualMatch(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-primary/5 py-3.5 text-sm font-bold text-primary"
          >
            <Swords className="h-4 w-4" />
            Lançar Rei da Quadra
          </button>
        </div>
      )}

      <div className="space-y-5 px-5">
        {/* Confirmed players */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Jogadores confirmados ({confirmedCount})
          </h2>
          {confirmedPlayers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum jogador confirmado ainda.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {confirmedPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1.5"
                >
                  {p.profile?.avatar_url ? (
                    <img src={p.profile.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                      {(p.profile?.name || "?").charAt(0)}
                    </div>
                  )}
                  <span className="text-xs font-medium text-foreground">
                    {p.profile?.nickname || p.profile?.name || "Jogador"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Matches */}
        {matches.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Partidas ({matches.length})
            </h2>
            <div className="space-y-3">
              {matches.map((match: any) => {
                const teamA = match.match_players?.filter((mp: any) => mp.team === "A") || [];
                const teamB = match.match_players?.filter((mp: any) => mp.team === "B") || [];
                const sets = match.match_sets || [];

                return (
                  <div key={match.id} className="rounded-2xl border border-border bg-card/50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Swords className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold text-foreground">
                          Partida {match.match_number}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            match.status === "scheduled"
                              ? "bg-info/10 text-info"
                              : match.status === "in_progress"
                              ? "bg-warning/10 text-warning"
                              : "bg-success/10 text-success"
                          }`}
                        >
                          {match.status === "scheduled" ? "Aguardando" : match.status === "in_progress" ? "Em jogo" : "Finalizada"}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteMatch(match.id)}
                            disabled={deletingMatchId === match.id}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Team A */}
                      <div className="flex-1">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          Time A
                        </p>
                        {teamA.map((mp: any) => (
                          <div key={mp.id} className="flex items-center gap-1.5 py-0.5">
                            {mp.profile?.avatar_url ? (
                              <img src={mp.profile.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                                {(mp.profile?.name || "?").charAt(0)}
                              </div>
                            )}
                            <span className="text-xs text-foreground">
                              {mp.profile?.nickname || mp.profile?.name || "Jogador"}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Score */}
                      <div className="flex items-center gap-1.5 text-center">
                        {sets.length > 0 ? (
                          sets.map((s: any) => (
                            <div key={s.id} className="rounded-lg bg-muted px-2 py-1">
                              <span className="font-display text-sm font-bold text-foreground">
                                {s.score_team_a}-{s.score_team_b}
                              </span>
                            </div>
                          ))
                        ) : (
                          <span className="font-display text-lg font-bold text-muted-foreground">vs</span>
                        )}
                      </div>

                      {/* Team B */}
                      <div className="flex-1 text-right">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-info">
                          Time B
                        </p>
                        {teamB.map((mp: any) => (
                          <div key={mp.id} className="flex items-center justify-end gap-1.5 py-0.5">
                            <span className="text-xs text-foreground">
                              {mp.profile?.nickname || mp.profile?.name || "Jogador"}
                            </span>
                            {mp.profile?.avatar_url ? (
                              <img src={mp.profile.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                                {(mp.profile?.name || "?").charAt(0)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Score entry / edit button */}
                    {isAdmin && match.status !== "completed" && (
                      <button
                        onClick={() => setScoringMatch(match)}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 py-2 text-xs font-semibold text-primary"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Registrar Placar
                      </button>
                    )}

                    {match.status === "completed" && (
                      <div className="mt-3 flex items-center gap-2">
                        {match.winner_team && (
                          <div className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-success/10 py-1.5 text-xs font-semibold text-success">
                            🏆 Time {match.winner_team} venceu
                          </div>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => setScoringMatch(match)}
                            className="flex items-center gap-1.5 rounded-xl bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Edit3 className="h-3 w-3" />
                            Editar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Score Entry Dialog */}
      {scoringMatch && (
        <ScoreEntryDialog
          matchId={scoringMatch.id}
          seasonId={seasonId}
          matchNumber={scoringMatch.match_number}
          teamA={(scoringMatch.match_players || [])
            .filter((mp: any) => mp.team === "A")
            .map((mp: any) => ({
              name: mp.profile?.nickname || mp.profile?.name || "Jogador",
              avatarUrl: mp.profile?.avatar_url,
            }))}
          teamB={(scoringMatch.match_players || [])
            .filter((mp: any) => mp.team === "B")
            .map((mp: any) => ({
              name: mp.profile?.nickname || mp.profile?.name || "Jogador",
              avatarUrl: mp.profile?.avatar_url,
            }))}
          existingSets={(scoringMatch.match_sets || []).map((s: any) => ({
            setNumber: s.set_number,
            scoreA: s.score_team_a,
            scoreB: s.score_team_b,
          }))}
          onClose={() => setScoringMatch(null)}
          onSaved={refresh}
        />
      )}

      {showManualMatch && (
        <ManualMatchDialog
          roundId={roundId}
          groupId={groupId}
          onClose={() => setShowManualMatch(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
