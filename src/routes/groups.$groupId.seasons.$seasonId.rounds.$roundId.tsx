import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { useGroupDetail } from "@/hooks/use-groups";
import { useRoundDetail, confirmPresence, cancelPresence, drawTeams, deleteMatch, deleteRound } from "@/hooks/use-seasons";
import { supabase } from "@/integrations/supabase/client";
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
  Ban,
  ChevronDown,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { isPresenceOpen, getPresenceOpenDate, formatPresenceOpenDate } from "@/lib/presence-schedule";

export const Route = createFileRoute(
  "/groups/$groupId/seasons/$seasonId/rounds/$roundId"
)({
  component: RoundDetailPage,
});

function RoundDetailPage() {
  const { groupId, seasonId, roundId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { group, memberCount, isAdmin } = useGroupDetail(groupId);
  const { round, presences, matches, myPresence, confirmedCount, isLoading, refresh } =
    useRoundDetail(roundId);
  const [scoringMatch, setScoringMatch] = useState<any>(null);
  const [showManualMatch, setShowManualMatch] = useState(false);
  const [seasonData, setSeasonData] = useState<any>(null);

  // Load season config for sets_per_match
  useEffect(() => {
    supabase
      .from("seasons")
      .select("sets_per_match, match_format, singles_pairing_mode")
      .eq("id", seasonId)
      .single()
      .then(({ data }) => { if (data) setSeasonData(data); });
  }, [seasonId]);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [deletingRound, setDeletingRound] = useState(false);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [matchRatings, setMatchRatings] = useState<Record<string, any[]>>({});

  // Presence schedule config (must be before early returns)
  const presenceConfig = useMemo(() => ({
    presence_open_mode: (group as any)?.presence_open_mode || "always",
    presence_open_time: (group as any)?.presence_open_time || "10:00:00",
  }), [group]);

  const loadMatchRatings = async (matchId: string) => {
    if (matchRatings[matchId]) {
      setExpandedMatch(expandedMatch === matchId ? null : matchId);
      return;
    }
    const { data } = await supabase
      .from("rating_events")
      .select("*")
      .eq("match_id", matchId);
    if (data?.length) {
      const userIds = data.map((d) => d.user_id);
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, name, nickname")
        .in("user_id", userIds);
      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      const enriched = data.map((d) => ({ ...d, profile: profileMap.get(d.user_id) }));
      setMatchRatings((prev) => ({ ...prev, [matchId]: enriched }));
    } else {
      setMatchRatings((prev) => ({ ...prev, [matchId]: [] }));
    }
    setExpandedMatch(matchId);
  };

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

  const handleCancelRound = async () => {
    if (!confirm("Cancelar esta rodada? Ela ficará marcada como não realizada.")) return;
    try {
      const { error } = await supabase.from("rounds").update({ status: "cancelled" }).eq("id", roundId);
      if (error) throw error;
      toast.success("Rodada cancelada");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Erro ao cancelar rodada");
    }
  };

  const handleDeleteRound = async () => {
    if (!confirm("Tem certeza que deseja EXCLUIR esta rodada? Todas as partidas e dados serão perdidos permanentemente.")) return;
    setDeletingRound(true);
    try {
      await deleteRound(roundId);
      toast.success("Rodada excluída!");
      navigate({ to: "/groups/$groupId/seasons/$seasonId", params: { groupId, seasonId } });
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir rodada");
    } finally {
      setDeletingRound(false);
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
  const isSingles = group?.match_format === "singles";
  const singlesCapacity = Math.min(
    round.max_players || 2,
    group?.max_players || Number.POSITIVE_INFINITY,
    memberCount > 0 ? memberCount : Number.POSITIVE_INFINITY,
    group?.singles_group_type === "rivalry" ? 2 : Number.POSITIVE_INFINITY,
  );
  const displayCapacity = isSingles ? singlesCapacity : round.max_players;
  const minPlayersForDraw = isSingles ? 2 : 4;
  const canDraw = isAdmin && confirmedPlayers.length >= minPlayersForDraw && matches.length === 0;

  const presenceListOpen = isPresenceOpen(presenceConfig, round.scheduled_date, round.scheduled_time, roundId);
  const presenceOpenDate = getPresenceOpenDate(presenceConfig, round.scheduled_date, round.scheduled_time, roundId);

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
                round.status === "cancelled"
                  ? "bg-destructive/10 text-destructive"
                  : round.status === "scheduled" && round.scheduled_date && round.scheduled_date <= new Date().toISOString().split("T")[0]
                  ? "bg-warning/10 text-warning"
                  : round.status === "scheduled"
                  ? "bg-info/10 text-info"
                  : round.status === "in_progress"
                  ? "bg-warning/10 text-warning"
                  : "bg-success/10 text-success"
              }`}
            >
              {round.status === "cancelled"
                ? "Cancelada"
                : round.status === "scheduled" && round.scheduled_date && round.scheduled_date <= new Date().toISOString().split("T")[0]
                ? "Lançar resultado"
                : round.status === "scheduled" ? "Agendada" : round.status === "in_progress" ? "Em jogo" : "Encerrada"}
            </span>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              {round.status !== "cancelled" && (
                <button
                  onClick={handleCancelRound}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-warning/30 bg-warning/10 text-warning hover:bg-warning/20"
                  title="Cancelar rodada"
                >
                  <Ban className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={handleDeleteRound}
                disabled={deletingRound}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50"
                title="Excluir rodada"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
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
            <span>{confirmedCount}/{displayCapacity} confirmados</span>
          </div>
        </div>
      </div>

      {/* Presence buttons */}
      {round.status === "scheduled" && (
        <div className="mx-5 mb-5">
          {presenceListOpen ? (
            <div className="flex gap-2">
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
          ) : (
            <div className="rounded-2xl border border-border bg-card/50 p-4 text-center">
              <Clock className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Lista ainda não aberta</p>
              {presenceOpenDate && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Abre {formatPresenceOpenDate(presenceOpenDate)}
                </p>
              )}
            </div>
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
            {isSingles
              ? `Sortear Confrontos (${confirmedPlayers.length} jogadores → ${Math.floor(confirmedPlayers.length / 2)} confronto${Math.floor(confirmedPlayers.length / 2) !== 1 ? "s" : ""})`
              : `Sortear Times (${confirmedPlayers.length} jogadores → ${Math.floor(confirmedPlayers.length / 4)} partida${Math.floor(confirmedPlayers.length / 4) !== 1 ? "s" : ""})`}
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
            {isSingles ? "Montar Confrontos" : "Lançar Rei da Quadra"}
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
                          {isSingles ? `Confronto ${match.match_number}` : `${match.match_number}º Set`}
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
                        {teamA.map((mp: any) => (
                          <div key={mp.id} className="flex items-center gap-1.5 py-0.5">
                            {mp.profile?.avatar_url ? (
                              <img src={mp.profile.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                                {(mp.profile?.name || "?").charAt(0)}
                              </div>
                            )}
                            <span className={`text-xs ${match.status === "completed" && match.winner_team === "A" ? "font-bold text-primary" : "text-foreground"}`}>
                              {mp.profile?.nickname || mp.profile?.name || "Jogador"}
                              {match.status === "completed" && match.winner_team === "A" && " 🏆"}
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
                        {teamB.map((mp: any) => (
                          <div key={mp.id} className="flex items-center justify-end gap-1.5 py-0.5">
                            <span className={`text-xs ${match.status === "completed" && match.winner_team === "B" ? "font-bold text-primary" : "text-foreground"}`}>
                              {mp.profile?.nickname || mp.profile?.name || "Jogador"}
                              {match.status === "completed" && match.winner_team === "B" && " 🏆"}
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

                    {/* Score entry button */}
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
                      <>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => loadMatchRatings(match.id)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-muted/50 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronDown className={`h-3 w-3 transition-transform ${expandedMatch === match.id ? "rotate-180" : ""}`} />
                            Detalhes do ranking
                          </button>
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
                        {expandedMatch === match.id && matchRatings[match.id] && (
                          <div className="mt-2 space-y-1.5 rounded-xl border border-border bg-muted/20 p-3 animate-in slide-in-from-top-2 duration-200">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Impacto no Ranking</p>
                            {matchRatings[match.id].map((re: any) => (
                              <div key={re.id} className="flex items-center justify-between">
                                <span className="text-xs text-foreground">{re.profile?.nickname || re.profile?.name || "Jogador"}</span>
                                <div className="flex items-center gap-3 text-xs">
                                  <span className={`font-bold ${Number(re.rating_change) > 0 ? "text-success" : "text-destructive"}`}>
                                    {Number(re.rating_change) > 0 ? "+" : ""}{Math.round(Number(re.rating_change))} pts
                                  </span>
                                  <span className="text-muted-foreground">{Math.round(Number(re.rating_after))} Elo</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
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
          setsPerMatch={isSingles ? (seasonData?.sets_per_match || 3) : 3}
          isSingles={isSingles}
          onClose={() => setScoringMatch(null)}
          onSaved={refresh}
        />
      )}

      {showManualMatch && (
        <ManualMatchDialog
          roundId={roundId}
          groupId={groupId}
          matchFormat={group?.match_format || "doubles"}
          onClose={() => setShowManualMatch(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
