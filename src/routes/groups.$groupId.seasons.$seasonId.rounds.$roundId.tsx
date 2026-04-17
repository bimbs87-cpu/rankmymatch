import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { PlayerAvatar } from "@/components/PlayerAvatar";

import { useGroupDetail } from "@/hooks/use-groups";
import { useRoundDetail, confirmPresence, cancelPresence, drawTeams, deleteMatch, deleteRound } from "@/hooks/use-seasons";
import { supabase } from "@/integrations/supabase/client";
import { ScoreEntryDialog } from "@/components/ScoreEntryDialog";
import { ManualMatchDialog } from "@/components/ManualMatchDialog";
import { isRivalryGroup } from "@/lib/rivalry";
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
  Trophy,
  Crown,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
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
  const { group, memberCount, members, isAdmin } = useGroupDetail(groupId);
  const { round, presences, matches, myPresence, confirmedCount, isLoading, refresh } =
    useRoundDetail(roundId);
  const [scoringMatch, setScoringMatch] = useState<any>(null);
  const [showManualMatch, setShowManualMatch] = useState(false);
  const [seasonData, setSeasonData] = useState<any>(null);

  const rivalry = isRivalryGroup(group, memberCount);

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
  const [previousPositions, setPreviousPositions] = useState<Record<string, number> | null>(null);

  const formatCompactName = (name?: string | null) => {
    const safeName = (name || "Jogador").trim();
    const parts = safeName.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return safeName;
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };

  // Auto-load ratings for all completed matches
  useEffect(() => {
    if (!matches?.length) return;
    const completedIds = matches.filter((m: any) => m.status === "completed").map((m: any) => m.id);
    if (completedIds.length === 0) return;
    const loadAll = async () => {
      const { data } = await supabase
        .from("rating_events")
        .select("*")
        .in("match_id", completedIds);
      if (!data?.length) return;

      const userIds = [...new Set(data.map((row) => row.user_id))];
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, name, nickname")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      const grouped: Record<string, any[]> = {};
      for (const d of data) {
        if (!grouped[d.match_id]) grouped[d.match_id] = [];
        grouped[d.match_id].push({ ...d, profile: profileMap.get(d.user_id) });
      }
      setMatchRatings(grouped);
    };
    loadAll();
  }, [matches]);

  // Compute group ranking position variation: position BEFORE this round vs AFTER this round
  // (using cumulative rating_change across the season for all players who have played).
  useEffect(() => {
    if (!round || !seasonId) return;
    const currentDate = (round as any).scheduled_date;
    const currentNumber = (round as any).round_number;
    (async () => {
      // All completed rounds in season (we'll partition into "before" and "this/after")
      const { data: allRounds } = await supabase
        .from("rounds")
        .select("id, scheduled_date, round_number, status")
        .eq("season_id", seasonId)
        .eq("status", "completed");
      if (!allRounds?.length) { setPreviousPositions(null); return; }

      const isBefore = (r: any) => {
        const d = r.scheduled_date || "";
        const cd = currentDate || "";
        if (d !== cd) return d < cd;
        return (r.round_number || 0) < (currentNumber || 0);
      };
      const beforeRoundIds = allRounds.filter(isBefore).map((r) => r.id);
      const upToRoundIds = [...beforeRoundIds, roundId];

      // Fetch all matches for the relevant rounds in one go
      const { data: relMatches } = await supabase
        .from("matches")
        .select("id, round_id, status")
        .in("round_id", upToRoundIds)
        .eq("status", "completed");
      if (!relMatches?.length) { setPreviousPositions(null); return; }

      const matchToRound: Record<string, string> = {};
      for (const m of relMatches) matchToRound[m.id] = (m as any).round_id;

      const { data: events } = await supabase
        .from("rating_events")
        .select("match_id, user_id, rating_change")
        .in("match_id", relMatches.map((m) => m.id));
      if (!events?.length) { setPreviousPositions(null); return; }

      // Cumulative rating before this round and after this round
      const before: Record<string, number> = {};
      const after: Record<string, number> = {};
      const beforeSet = new Set(beforeRoundIds);
      for (const ev of events) {
        const rid = matchToRound[ev.match_id];
        const change = Number(ev.rating_change);
        after[ev.user_id] = (after[ev.user_id] || 0) + change;
        if (beforeSet.has(rid)) {
          before[ev.user_id] = (before[ev.user_id] || 0) + change;
        }
      }

      // Build position maps (rank by rating desc; ties keep insertion order)
      const sortMap = (m: Record<string, number>): Record<string, number> => {
        const sorted = Object.entries(m).sort(([, a], [, b]) => b - a);
        const out: Record<string, number> = {};
        sorted.forEach(([uid], i) => { out[uid] = i + 1; });
        return out;
      };
      const beforePos = sortMap(before);
      const afterPos = sortMap(after);

      // delta = beforePos - afterPos  (positive = subiu posições)
      // For players with no "before" entry (first round played), delta is null (NEW)
      const delta: Record<string, number> = {};
      for (const uid of Object.keys(afterPos)) {
        if (beforePos[uid] !== undefined) {
          delta[uid] = beforePos[uid] - afterPos[uid];
        }
      }
      // We re-use previousPositions state to store the *delta* keyed by user_id
      setPreviousPositions(delta);
    })();
  }, [round, seasonId, roundId]);


  const getPlayerEloChange = (matchId: string, userId: string) => {
    const events = matchRatings[matchId];
    if (!events) return null;
    const evt = events.find((e: any) => e.user_id === userId);
    return evt ? Math.round(Number(evt.rating_change)) : null;
  };

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
      // If this was the last match, reset round status
      const remainingMatches = matches.filter(m => m.id !== matchId);
      if (remainingMatches.length === 0) {
        await supabase.from("rounds").update({ status: "scheduled" }).eq("id", roundId);
      }
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

  // Auto-create match for rivalry when clicking "Lançar Resultado"
  const handleRivalryLaunchResult = async () => {
    if (!rivalry || !user) return;
    const twoMembers = members.slice(0, 2);
    if (twoMembers.length < 2) {
      toast.error("O grupo precisa de 2 membros para lançar resultado");
      return;
    }

    // Create match automatically with both members
    try {
      const { data: match, error } = await supabase
        .from("matches")
        .insert({
          round_id: roundId,
          match_number: 1,
          status: "scheduled",
          match_format: "singles",
        })
        .select()
        .single();

      if (error) throw error;

      const matchPlayers = [
        { match_id: match.id, user_id: twoMembers[0].user_id, team: "A" },
        { match_id: match.id, user_id: twoMembers[1].user_id, team: "B" },
      ];
      await supabase.from("match_players").insert(matchPlayers);

      // Auto-confirm presence for both
      for (const m of twoMembers) {
        await supabase.from("round_presence").upsert(
          { round_id: roundId, user_id: m.user_id, status: "confirmed", confirmed_at: new Date().toISOString() },
          { onConflict: "round_id,user_id" }
        );
      }

      await supabase.from("rounds").update({ status: "in_progress" }).eq("id", roundId);

      // Now open score dialog with fresh data
      await refresh();

      // Re-fetch to get profiles
      const { data: freshMatch } = await supabase
        .from("matches")
        .select("*, match_players(*), match_sets(*)")
        .eq("id", match.id)
        .single();

      if (freshMatch) {
        const playerIds = (freshMatch.match_players || []).map((mp: any) => mp.user_id);
        const { data: profiles } = await supabase.from("user_profiles").select("*").in("user_id", playerIds);
        const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
        const enrichedMatch = {
          ...freshMatch,
          match_players: (freshMatch.match_players || []).map((mp: any) => ({
            ...mp,
            profile: profileMap.get(mp.user_id),
          })),
        };
        setScoringMatch(enrichedMatch);
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar confronto");
    }
  };

  if (isLoading) {
    return <TrophyLoadingBar />;
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
    rivalry ? 2 : Number.POSITIVE_INFINITY,
  );
  const displayCapacity = isSingles ? singlesCapacity : round.max_players;
  const minPlayersForDraw = isSingles ? 2 : 4;
  const canDraw = isAdmin && confirmedPlayers.length >= minPlayersForDraw && matches.length === 0 && !rivalry;

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

  // For rivalry: check if there's already a completed match
  const hasCompletedMatch = matches.some(m => m.status === "completed");
  const hasAnyMatch = matches.length > 0;
  const rivalryShowLaunch = rivalry && isAdmin && !hasAnyMatch && round.status !== "cancelled";
  const rivalryShowEdit = rivalry && isAdmin && hasCompletedMatch;

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
                : round.status === "completed"
                ? "Encerrada"
                : round.status === "in_progress"
                ? (() => {
                    // Check if all matches are completed — if so, round should show as encerrada
                    const allCompleted = matches.length > 0 && matches.every((m: any) => m.status === "completed");
                    return allCompleted ? "Encerrada" : "Em andamento";
                  })()
                : round.scheduled_date && round.scheduled_date <= new Date().toISOString().split("T")[0]
                ? "Aguardando resultado"
                : "Agendada"}
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
          {!rivalry && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              <span>{confirmedCount}/{displayCapacity} confirmados</span>
            </div>
          )}
        </div>
      </div>

      {/* Presence buttons - hide for rivalry (auto-managed) */}
      {!rivalry && round.status === "scheduled" && (
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

      {/* Rivalry: Direct launch result button */}
      {rivalryShowLaunch && (
        <div className="mx-5 mb-5">
          <button
            onClick={handleRivalryLaunchResult}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground"
          >
            <Swords className="h-4 w-4" />
            Lançar Resultado
          </button>
        </div>
      )}

      {/* Draw button - hidden for rivalry */}
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

      {/* Manual match creation - hidden for rivalry */}
      {isAdmin && matches.length === 0 && !rivalry && (
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
        {/* Confirmed players - hide for rivalry */}
        {!rivalry && (
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
                    <PlayerAvatar avatarUrl={p.profile?.avatar_url || null} name={p.profile?.name || "?"} size="xs" />
                    <span className="text-xs font-medium text-foreground">
                      {p.profile?.nickname || p.profile?.name || "Jogador"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Matches */}
        {matches.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {rivalry ? "Confronto" : `Partidas (${matches.length})`}
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
                          {rivalry ? "Confronto" : isSingles ? `Confronto ${match.match_number}` : `${match.match_number}º Set`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            match.status === "completed"
                              ? "bg-success/10 text-success"
                              : match.status === "in_progress"
                              ? "bg-warning/10 text-warning"
                              : "bg-info/10 text-info"
                          }`}
                        >
                          {match.status === "completed" ? "Finalizado" : match.status === "in_progress" ? "Em andamento" : "Aguardando resultado"}
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
                      <div className="flex-1 space-y-1">
                        {teamA.map((mp: any) => {
                          const eloChange = match.status === "completed" ? getPlayerEloChange(match.id, mp.user_id) : null;
                          const isWinner = match.status === "completed" && match.winner_team === "A";
                          const displayName = formatCompactName(mp.profile?.nickname || mp.profile?.name || "Jogador");
                          return (
                            <div key={mp.id} className="flex items-center gap-1.5 py-0.5 min-w-0">
                              <PlayerAvatar avatarUrl={mp.profile?.avatar_url || null} name={mp.profile?.name || "?"} size="xs" />
                              <span className={`min-w-0 flex-1 truncate text-xs ${isWinner ? "font-bold text-primary" : "text-foreground"}`}>
                                {displayName}
                              </span>
                              <span className={`w-9 text-right text-[10px] font-bold ${eloChange === null ? "opacity-0" : eloChange > 0 ? "text-success" : "text-destructive"}`}>
                                {eloChange === null ? "0" : `${eloChange > 0 ? "+" : ""}${eloChange}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>

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

                      <div className="flex-1 space-y-1 text-right">
                        {teamB.map((mp: any) => {
                          const eloChange = match.status === "completed" ? getPlayerEloChange(match.id, mp.user_id) : null;
                          const isWinner = match.status === "completed" && match.winner_team === "B";
                          const displayName = formatCompactName(mp.profile?.nickname || mp.profile?.name || "Jogador");
                          return (
                            <div key={mp.id} className="flex items-center justify-end gap-1.5 py-0.5 min-w-0">
                              <span className={`w-9 text-left text-[10px] font-bold ${eloChange === null ? "opacity-0" : eloChange > 0 ? "text-success" : "text-destructive"}`}>
                                {eloChange === null ? "0" : `${eloChange > 0 ? "+" : ""}${eloChange}`}
                              </span>
                              <span className={`min-w-0 truncate text-xs ${isWinner ? "font-bold text-primary" : "text-foreground"}`}>
                                {displayName}
                              </span>
                              <PlayerAvatar avatarUrl={mp.profile?.avatar_url || null} name={mp.profile?.name || "?"} size="xs" />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Singles/Rivalry winner summary */}
                    {(isSingles || rivalry) && match.status === "completed" && match.winner_team && sets.length > 0 && (() => {
                      const winnerPlayers = match.winner_team === "A" ? teamA : teamB;
                      const winnerName = winnerPlayers[0]?.profile?.nickname || winnerPlayers[0]?.profile?.name || "Jogador";
                      const setsWonA = sets.filter((s: any) => s.score_team_a > s.score_team_b).length;
                      const setsWonB = sets.filter((s: any) => s.score_team_b > s.score_team_a).length;
                      const setScores = [...sets].sort((a: any, b: any) => a.set_number - b.set_number).map((s: any) => `${s.score_team_a}-${s.score_team_b}`).join(" • ");
                      return (
                        <div className="mt-2 rounded-xl bg-success/5 border border-success/20 px-3 py-2">
                          <p className="text-xs font-semibold text-success flex items-center gap-1.5">
                            <Trophy className="h-3.5 w-3.5" />
                            {winnerName} venceu por {match.winner_team === "A" ? setsWonA : setsWonB} set{(match.winner_team === "A" ? setsWonA : setsWonB) > 1 ? "s" : ""} a {match.winner_team === "A" ? setsWonB : setsWonA}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">Sets: {setScores}</p>
                        </div>
                      );
                    })()}

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

        {/* Resumo do Rei da Quadra — aggregate stats when all matches completed */}
        {!isSingles && !rivalry && matches.length > 1 && matches.every((m: any) => m.status === "completed") && (() => {
          // Aggregate player stats across all matches in this round
          const playerStats: Record<string, { wins: number; gamesWon: number; gamesLost: number; eloChange: number; name: string; avatarUrl: string | null }> = {};
          
          for (const match of matches) {
            const teamA = match.match_players?.filter((mp: any) => mp.team === "A") || [];
            const teamB = match.match_players?.filter((mp: any) => mp.team === "B") || [];
            const sets = match.match_sets || [];
            
            const setsA = sets.filter((s: any) => s.score_team_a > s.score_team_b).length;
            const setsB = sets.filter((s: any) => s.score_team_b > s.score_team_a).length;
            const gA = sets.reduce((sum: number, s: any) => sum + s.score_team_a, 0);
            const gB = sets.reduce((sum: number, s: any) => sum + s.score_team_b, 0);
            const winnerTeam = setsA > setsB ? "A" : setsB > setsA ? "B" : null;
            
            for (const mp of [...teamA, ...teamB]) {
              if (!playerStats[mp.user_id]) {
                playerStats[mp.user_id] = { wins: 0, gamesWon: 0, gamesLost: 0, eloChange: 0, name: mp.profile?.nickname || mp.profile?.name || "Jogador", avatarUrl: mp.profile?.avatar_url || null };
              }
              const isTeamA = mp.team === "A";
              playerStats[mp.user_id].gamesWon += isTeamA ? gA : gB;
              playerStats[mp.user_id].gamesLost += isTeamA ? gB : gA;
              if (winnerTeam && ((isTeamA && winnerTeam === "A") || (!isTeamA && winnerTeam === "B"))) {
                playerStats[mp.user_id].wins++;
              }
              const eloChange = getPlayerEloChange(match.id, mp.user_id);
              if (eloChange !== null) playerStats[mp.user_id].eloChange += eloChange;
            }
          }

          const sorted = Object.entries(playerStats).sort(([, a], [, b]) => {
            if (b.eloChange !== a.eloChange) return b.eloChange - a.eloChange;
            if (b.wins !== a.wins) return b.wins - a.wins;
            return (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
          });

          return (
            <section className="mt-2">
              <div className="rounded-2xl border border-border bg-card/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Resumo do Rei da Quadra
                  </span>
                </div>
                <div className="space-y-2">
                  {sorted.map(([uid, stats], i) => {
                    const isWinner = i === 0;
                    const currentPos = i + 1;
                    const delta = previousPositions && previousPositions[uid] !== undefined ? previousPositions[uid] : null;
                    return (
                      <div
                        key={uid}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 ${
                          isWinner ? "bg-primary/10 border border-primary/20" : ""
                        }`}
                      >
                        <span className={`w-5 text-sm font-bold ${isWinner ? "text-primary" : "text-muted-foreground"}`}>
                          {currentPos}º
                        </span>
                        {delta !== null && (
                          <span
                            className={`inline-flex items-center text-[10px] font-bold tabular-nums w-7 ${
                              delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground"
                            }`}
                            title="Variação de posição no ranking do grupo"
                          >
                            {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${Math.abs(delta)}` : "—"}
                          </span>
                        )}
                        <PlayerAvatar avatarUrl={stats.avatarUrl} name={stats.name} size="xs" />
                        <div className="flex-1 min-w-0">
                          <span className={`block text-sm truncate ${isWinner ? "text-primary font-bold" : "text-foreground font-medium"}`}>
                            {stats.name}
                          </span>
                          {stats.eloChange !== 0 && (
                            <span className={`mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold ${stats.eloChange > 0 ? "text-success" : "text-destructive"}`}>
                              {stats.eloChange > 0 ? "▲" : "▼"} {stats.eloChange > 0 ? "+" : ""}{stats.eloChange} pts
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-bold text-success">{stats.wins}V</span>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{stats.gamesWon}–{stats.gamesLost}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })()}
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
              userId: mp.user_id,
            }))}
          teamB={(scoringMatch.match_players || [])
            .filter((mp: any) => mp.team === "B")
            .map((mp: any) => ({
              name: mp.profile?.nickname || mp.profile?.name || "Jogador",
              avatarUrl: mp.profile?.avatar_url,
              userId: mp.user_id,
            }))}
          existingSets={(scoringMatch.match_sets || []).map((s: any) => ({
            setNumber: s.set_number,
            scoreA: s.score_team_a,
            scoreB: s.score_team_b,
          }))}
          setsPerMatch={rivalry ? 99 : isSingles ? (seasonData?.sets_per_match || 3) : 3}
          isSingles={isSingles || rivalry}
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
