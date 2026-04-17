import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { submitMatchScore, previewMatchEloChanges } from "@/lib/elo-engine";
import { PlayerAvatar as SharedPlayerAvatar } from "@/components/PlayerAvatar";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { X, Check, ChevronRight, Save, Swords, Users, Crown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

interface GroupMember {
  user_id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
}

interface Matchup {
  teamA: string[];
  teamB: string[];
  scoreA: number;
  scoreB: number;
}

interface Props {
  roundId: string;
  groupId: string;
  matchFormat?: string;
  onClose: () => void;
  onSaved: () => void;
}

function generateDoublesMatchups(players: string[]): Matchup[] {
  if (players.length !== 4) return [];
  const [a, b, c, d] = players;
  return [
    { teamA: [a, b], teamB: [c, d], scoreA: 0, scoreB: 0 },
    { teamA: [a, c], teamB: [b, d], scoreA: 0, scoreB: 0 },
    { teamA: [a, d], teamB: [b, c], scoreA: 0, scoreB: 0 },
  ];
}

function generateSinglesMatchup(players: string[]): Matchup[] {
  if (players.length !== 2) return [];
  return [{ teamA: [players[0]], teamB: [players[1]], scoreA: 0, scoreB: 0 }];
}

export function ManualMatchDialog({ roundId, groupId, matchFormat = "doubles", onClose, onSaved }: Props) {
  const isSingles = matchFormat === "singles";
  const requiredPlayers = isSingles ? 2 : 4;

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [step, setStep] = useState<"select" | "scores">("select");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playerRankings, setPlayerRankings] = useState<Record<string, { rating: number; position: number | null; prevPosition: number | null; matchesPlayed: number }>>({});
  const [saveStep, setSaveStep] = useState(0);
  const [saveStepLabel, setSaveStepLabel] = useState("");

  const saveSteps = useRef([
    "Confirmando presença...",
    isSingles ? "Salvando confronto..." : "Salvando jogos...",
    "Calculando vencedor...",
    "Atualizando Elo...",
    "Atualizando ranking...",
    "Finalizando...",
  ]);

  const waitForNextPaint = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  useEffect(() => {
    const load = async () => {
      const { data: gm } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .eq("status", "active");

      if (gm?.length) {
        const ids = gm.map((m) => m.user_id);
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, name, nickname, avatar_url")
          .in("user_id", ids);
        setMembers(
          (profiles || []).map((p) => ({
            user_id: p.user_id,
            name: p.name || "Jogador",
            nickname: p.nickname,
            avatar_url: p.avatar_url,
          }))
        );
      }
      setLoading(false);
    };
    load();
  }, [groupId]);

  useEffect(() => {
    if (!submitting) {
      setSaveStep(0);
      setSaveStepLabel("");
      return;
    }

    setSaveStep(1);
    setSaveStepLabel(saveSteps.current[0]);

    let step = 1;
    const interval = setInterval(() => {
      step += 1;
      if (step <= saveSteps.current.length) {
        setSaveStep(step);
        setSaveStepLabel(saveSteps.current[step - 1]);
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [submitting]);

  const togglePlayer = (uid: string) => {
    setSelectedPlayers((prev) => {
      if (prev.includes(uid)) return prev.filter((id) => id !== uid);
      if (prev.length >= requiredPlayers) return prev;
      return [...prev, uid];
    });
  };

  const goToScores = async () => {
    if (selectedPlayers.length !== requiredPlayers) return;
    if (isSingles) {
      setMatchups(generateSinglesMatchup(selectedPlayers));
    } else {
      setMatchups(generateDoublesMatchups(selectedPlayers));
    }
    setStep("scores");

    // Fetch current ranking data for selected players
    const { data: roundData } = await supabase
      .from("rounds")
      .select("season_id")
      .eq("id", roundId)
      .single();

    if (roundData?.season_id) {
      const { data: snapshots } = await supabase
        .from("ranking_snapshots")
        .select("user_id, rating, position, matches_played")
        .eq("season_id", roundData.season_id)
        .in("user_id", selectedPlayers);

      // Get previous round's positions by looking at rating_events
      const { data: prevRounds } = await supabase
        .from("rounds")
        .select("id")
        .eq("group_id", groupId)
        .eq("season_id", roundData.season_id)
        .neq("id", roundId)
        .order("round_number", { ascending: false })
        .limit(1);

      const rankings: Record<string, { rating: number; position: number | null; prevPosition: number | null; matchesPlayed: number }> = {};
      for (const uid of selectedPlayers) {
        const snap = snapshots?.find((s) => s.user_id === uid);
        rankings[uid] = {
          rating: snap ? Number(snap.rating) : 1000,
          position: snap?.position ?? null,
          prevPosition: null,
          matchesPlayed: snap?.matches_played ?? 0,
        };
      }

      // If there was a previous round, estimate previous positions from current data
      if (prevRounds?.[0]) {
        const prevRoundId = prevRounds[0].id;
        const { data: prevMatches } = await supabase
          .from("matches")
          .select("id")
          .eq("round_id", prevRoundId);

        if (prevMatches?.length) {
          const matchIds = prevMatches.map((m) => m.id);
          const { data: prevEvents } = await supabase
            .from("rating_events")
            .select("user_id, rating_before")
            .in("match_id", matchIds)
            .in("user_id", selectedPlayers);

          if (prevEvents?.length) {
            // Get all snapshots to compute previous positions
            const { data: allSnaps } = await supabase
              .from("ranking_snapshots")
              .select("user_id, rating, position")
              .eq("season_id", roundData.season_id)
              .eq("is_eligible", true)
              .order("rating", { ascending: false });

            if (allSnaps) {
              // Previous rating = current rating - last change
              const prevRatings: { uid: string; prevRating: number }[] = [];
              for (const snap of allSnaps) {
                const evt = prevEvents.find((e) => e.user_id === snap.user_id);
                prevRatings.push({
                  uid: snap.user_id,
                  prevRating: evt ? Number(evt.rating_before) : Number(snap.rating),
                });
              }
              prevRatings.sort((a, b) => b.prevRating - a.prevRating);
              for (let i = 0; i < prevRatings.length; i++) {
                if (rankings[prevRatings[i].uid]) {
                  rankings[prevRatings[i].uid].prevPosition = i + 1;
                }
              }
            }
          }
        }
      }

      setPlayerRankings(rankings);
    }
  };

  const setScore = (matchIdx: number, team: "A" | "B", value: number) => {
    setMatchups((prev) =>
      prev.map((m, i) => {
        if (i !== matchIdx) return m;
        const key = team === "A" ? "scoreA" : "scoreB";
        return { ...m, [key]: Math.max(0, Math.min(99, value)) };
      })
    );
  };

  const updateScore = (matchIdx: number, team: "A" | "B", delta: number) => {
    setMatchups((prev) =>
      prev.map((m, i) => {
        if (i !== matchIdx) return m;
        const key = team === "A" ? "scoreA" : "scoreB";
        return { ...m, [key]: Math.max(0, Math.min(99, m[key] + delta)) };
      })
    );
  };

  const moveMatchup = (idx: number, direction: "up" | "down") => {
    setMatchups((prev) => {
      const arr = [...prev];
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= arr.length) return prev;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  };

  const getDisplayName = (uid: string) => {
    const m = members.find((x) => x.user_id === uid);
    return m?.nickname || m?.name?.split(" ")[0] || "?";
  };

  const getAvatar = (uid: string) => members.find((x) => x.user_id === uid)?.avatar_url;
  const getInitial = (uid: string) => getDisplayName(uid).charAt(0).toUpperCase();

  const allValid = matchups.every((m) => m.scoreA !== m.scoreB);

  const playerPoints = useMemo(() => {
    const pts: Record<string, { wins: number; gamesWon: number; gamesLost: number }> = {};
    for (const uid of selectedPlayers) {
      pts[uid] = { wins: 0, gamesWon: 0, gamesLost: 0 };
    }
    for (const m of matchups) {
      const winnerTeam = m.scoreA > m.scoreB ? "A" : m.scoreB > m.scoreA ? "B" : null;
      for (const uid of m.teamA) {
        pts[uid].gamesWon += m.scoreA;
        pts[uid].gamesLost += m.scoreB;
        if (winnerTeam === "A") pts[uid].wins++;
      }
      for (const uid of m.teamB) {
        pts[uid].gamesWon += m.scoreB;
        pts[uid].gamesLost += m.scoreA;
        if (winnerTeam === "B") pts[uid].wins++;
      }
    }
    return pts;
  }, [matchups, selectedPlayers]);

  // Live preview of Elo deltas — per match and aggregated across all matches
  // for the round. Uses simulated rating updates between matches so the
  // sequential effect mirrors what processMatchElo will do at save time.
  const eloPreview = useMemo(() => {
    const perMatch: { delta: Record<string, number>; ratingsBefore: Record<string, number> }[] = [];
    const totals: Record<string, number> = {};
    const liveRatings: Record<string, number> = {};
    const matchesPlayedSim: Record<string, number> = {};

    for (const uid of selectedPlayers) {
      liveRatings[uid] = playerRankings[uid]?.rating ?? 1000;
      matchesPlayedSim[uid] = playerRankings[uid]?.matchesPlayed ?? 0;
      totals[uid] = 0;
    }

    for (const mu of matchups) {
      const valid = mu.scoreA !== mu.scoreB && (mu.scoreA > 0 || mu.scoreB > 0);
      const ratingsBefore = { ...liveRatings };
      if (!valid) {
        const empty: Record<string, number> = {};
        [...mu.teamA, ...mu.teamB].forEach((uid) => (empty[uid] = 0));
        perMatch.push({ delta: empty, ratingsBefore });
        continue;
      }
      const delta = previewMatchEloChanges({
        teamA: mu.teamA.map((uid) => ({
          userId: uid,
          rating: liveRatings[uid],
          matchesPlayed: matchesPlayedSim[uid],
        })),
        teamB: mu.teamB.map((uid) => ({
          userId: uid,
          rating: liveRatings[uid],
          matchesPlayed: matchesPlayedSim[uid],
        })),
        setsTeamA: mu.scoreA > mu.scoreB ? 1 : 0,
        setsTeamB: mu.scoreB > mu.scoreA ? 1 : 0,
        gamesTeamA: mu.scoreA,
        gamesTeamB: mu.scoreB,
      });
      perMatch.push({ delta, ratingsBefore });
      for (const uid of [...mu.teamA, ...mu.teamB]) {
        const d = delta[uid] ?? 0;
        liveRatings[uid] = (liveRatings[uid] ?? 1000) + d;
        matchesPlayedSim[uid] = (matchesPlayedSim[uid] ?? 0) + 1;
        totals[uid] = (totals[uid] ?? 0) + d;
      }
    }

    return { perMatch, totals, liveRatings };
  }, [matchups, selectedPlayers, playerRankings]);

  const formatEloDelta = (delta: number) => {
    if (!delta) return "±0";
    const rounded = Math.round(delta);
    if (rounded === 0) {
      return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
    }
    return `${rounded > 0 ? "+" : ""}${rounded}`;
  };

  const handleSubmit = async () => {
    if (!allValid) {
      toast.error("Todos os confrontos precisam ter um vencedor (sem empates)");
      return;
    }
    setSubmitting(true);
    try {
      await waitForNextPaint();

      for (const uid of selectedPlayers) {
        await supabase.from("round_presence").upsert(
          { round_id: roundId, user_id: uid, status: "confirmed", confirmed_at: new Date().toISOString() },
          { onConflict: "round_id,user_id" }
        ).then(({ error }) => {
          if (error) {
            return supabase.from("round_presence").insert({
              round_id: roundId, user_id: uid, status: "confirmed", confirmed_at: new Date().toISOString(),
            });
          }
        });
      }

      const { data: roundData } = await supabase
        .from("rounds")
        .select("season_id, round_number, group_id")
        .eq("id", roundId)
        .single();

      const seasonId = roundData?.season_id || "";

      for (let i = 0; i < matchups.length; i++) {
        const mu = matchups[i];
        const winnerTeam = mu.scoreA > mu.scoreB ? "A" : "B";
        const { data: match, error } = await supabase
          .from("matches")
          .insert({
            round_id: roundId,
            match_number: i + 1,
            status: "completed",
            winner_team: winnerTeam,
            match_format: isSingles ? "singles" : "doubles",
          })
          .select()
          .single();
        if (error) throw error;

        const players = [
          ...mu.teamA.map((uid) => ({ match_id: match.id, user_id: uid, team: "A" })),
          ...mu.teamB.map((uid) => ({ match_id: match.id, user_id: uid, team: "B" })),
        ];
        await supabase.from("match_players").insert(players);

        await submitMatchScore(match.id, seasonId, [
          { setNumber: 1, scoreA: mu.scoreA, scoreB: mu.scoreB },
        ]);
      }

      await supabase.from("rounds").update({ status: "completed" }).eq("id", roundId);

      if (roundData?.group_id) {
        const { data: currentUser } = await supabase.auth.getUser();
        const actorId = currentUser?.user?.id || "";
        const playerNames = selectedPlayers.map((uid) => getDisplayName(uid)).join(", ");
        
        const notifRows = selectedPlayers
          .filter((uid) => uid !== actorId)
          .map((uid) => ({
            user_id: uid,
            group_id: roundData.group_id,
            type: "match_result",
            title: "Resultado registrado! 🏆",
            body: isSingles
              ? `Rodada ${roundData.round_number} — Confronto entre ${playerNames}. Confira o resultado!`
              : `Rodada ${roundData.round_number} — Rei da Quadra com ${playerNames}. Confira o resultado!`,
            data: { roundId, seasonId },
          }));
        
        if (notifRows.length > 0) {
          await supabase.from("notifications").insert(notifRows);
        }
      }

      toast.success(isSingles ? "Confronto registrado com sucesso!" : "Rei da Quadra registrado com sucesso!");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  };

  const PlayerAvatar = ({ uid, size = "sm" }: { uid: string; size?: "sm" | "md" | "lg" }) => {
    const sizeMap = { sm: "sm" as const, md: "md" as const, lg: "lg" as const };
    const av = getAvatar(uid);
    return (
      <SharedPlayerAvatar
        avatarUrl={av || null}
        name={getDisplayName(uid)}
        size={sizeMap[size]}
        className="ring-2 ring-border"
      />
    );
  };

  const TeamLabel = ({ players, side }: { players: string[]; side: "left" | "right" }) => (
    <div className={`flex flex-col gap-1 ${side === "right" ? "items-end" : "items-start"}`}>
      {players.map((uid) => (
        <div key={uid} className={`flex items-center gap-2 ${side === "right" ? "flex-row-reverse" : ""}`}>
          <PlayerAvatar uid={uid} />
          <span className="text-sm font-medium text-foreground">{getDisplayName(uid)}</span>
        </div>
      ))}
    </div>
  );

  const TeamLabelWithElo = ({
    players,
    side,
    delta,
    showDelta,
  }: {
    players: string[];
    side: "left" | "right";
    delta: Record<string, number>;
    showDelta: boolean;
  }) => (
    <div className={`flex flex-col gap-1.5 ${side === "right" ? "items-end" : "items-start"}`}>
      {players.map((uid) => {
        const d = delta[uid] ?? 0;
        const positive = d > 0;
        const negative = d < 0;
        return (
          <div
            key={uid}
            className={`flex items-center gap-2 ${side === "right" ? "flex-row-reverse" : ""}`}
          >
            <PlayerAvatar uid={uid} />
            <div className={`flex flex-col ${side === "right" ? "items-end" : "items-start"}`}>
              <span className="text-sm font-medium text-foreground leading-tight">
                {getDisplayName(uid)}
              </span>
              {showDelta ? (
                <span
                  className={`text-[10px] font-bold leading-tight tabular-nums ${
                    positive ? "text-success" : negative ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {formatEloDelta(d)} Elo
                </span>
              ) : (
                <span className="text-[10px] font-medium leading-tight text-muted-foreground/60">
                  — Elo
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-border bg-card p-5 pb-6 animate-in zoom-in-95 duration-300">
        {submitting && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-card/95 px-6 backdrop-blur-sm">
            <div className="w-full max-w-sm space-y-4">
              <TrophyLoadingBar
                fullScreen={false}
                progress={Math.min((saveStep / saveSteps.current.length) * 100, 95)}
                label={saveStepLabel || "Processando resultados..."}
              />
              <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-primary">
                  {isSingles ? "Salvando confronto" : "Salvando resultados"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Aguarde a confirmação antes de fechar ou navegar para outra tela.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className={submitting ? "pointer-events-none opacity-20" : ""}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Swords className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">
                {step === "select" ? "Quem jogou?" : isSingles ? "Resultado do Confronto" : "Preencher Resultados"}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {step === "select"
                  ? `Selecione ${requiredPlayers} jogadores`
                  : isSingles
                  ? "1 confronto · resultado direto"
                  : "3 jogos · 1 set cada"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-full bg-muted/50 p-2 transition-colors hover:bg-muted disabled:opacity-50"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : step === "select" ? (
          <div>
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/10 px-3 py-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {selectedPlayers.length}/{requiredPlayers} selecionados
              </span>
              {selectedPlayers.length === requiredPlayers && (
                <Check className="h-4 w-4 text-success ml-auto" />
              )}
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {members.map((m) => {
                const isSelected = selectedPlayers.includes(m.user_id);
                const isDisabled = !isSelected && selectedPlayers.length >= requiredPlayers;
                return (
                  <button
                    key={m.user_id}
                    onClick={() => togglePlayer(m.user_id)}
                    disabled={isDisabled}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                      isSelected
                        ? "border border-primary/30 bg-primary/10"
                        : isDisabled
                        ? "opacity-30 cursor-not-allowed border border-transparent"
                        : "border border-transparent hover:bg-muted/50"
                    }`}
                  >
                    <PlayerAvatar uid={m.user_id} size="md" />
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {m.nickname || m.name}
                    </span>
                    {isSelected && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                        <Check className="h-3.5 w-3.5 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={goToScores}
              disabled={selectedPlayers.length !== requiredPlayers}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-40 transition-opacity"
            >
              {isSingles ? "Definir Resultado" : "Montar Jogos"}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setStep("select")}
              disabled={submitting}
              className="mb-4 text-xs text-primary font-semibold hover:underline"
            >
              ← Alterar jogadores
            </button>

            <div className="space-y-4">
              {matchups.map((mu, idx) => {
                const winner = mu.scoreA > mu.scoreB ? "A" : mu.scoreB > mu.scoreA ? "B" : null;
                const isTied = mu.scoreA === mu.scoreB && mu.scoreA > 0;
                return (
                  <div
                    key={idx}
                    className={`rounded-2xl border p-4 ${
                      isTied ? "border-warning/20 bg-warning/5" : winner ? "border-border bg-card" : "border-border bg-card"
                    }`}
                  >
                    {/* Match header */}
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {isSingles ? "Confronto" : `${idx + 1}º Jogo`}
                        </span>
                        {!isSingles && (
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => moveMatchup(idx, "up")}
                              disabled={idx === 0}
                              className="flex h-5 w-5 items-center justify-center rounded bg-muted text-muted-foreground disabled:opacity-20 active:scale-90 transition-all"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => moveMatchup(idx, "down")}
                              disabled={idx === matchups.length - 1}
                              className="flex h-5 w-5 items-center justify-center rounded bg-muted text-muted-foreground disabled:opacity-20 active:scale-90 transition-all"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      {isTied ? (
                        <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-[10px] font-semibold text-warning">
                          Empate
                        </span>
                      ) : null}
                    </div>

                    {/* Teams + Score */}
                    <div className="flex items-center gap-3">
                      <TeamLabelWithElo
                        players={mu.teamA}
                        side="left"
                        delta={eloPreview.perMatch[idx]?.delta || {}}
                        showDelta={!!winner && !isTied}
                      />

                      <div className="flex items-center gap-2 mx-auto">
                        <div className="flex flex-col items-center gap-1.5">
                          <button
                            onClick={() => updateScore(idx, "A", 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-90 active:bg-primary/20 transition-all select-none"
                          >
                            +
                          </button>
                          <div
                            className={`flex h-12 w-12 items-center justify-center rounded-xl text-center font-display text-2xl font-bold select-none ${
                              winner === "A" ? "bg-primary/20 text-primary ring-2 ring-primary/30" : "bg-muted/50 text-foreground"
                            }`}
                          >
                            {mu.scoreA}
                          </div>
                          <button
                            onClick={() => updateScore(idx, "A", -1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-90 active:bg-primary/20 transition-all select-none"
                          >
                            −
                          </button>
                        </div>

                        <span className="text-sm font-bold text-muted-foreground select-none">×</span>

                        <div className="flex flex-col items-center gap-1.5">
                          <button
                            onClick={() => updateScore(idx, "B", 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-90 active:bg-primary/20 transition-all select-none"
                          >
                            +
                          </button>
                          <div
                            className={`flex h-12 w-12 items-center justify-center rounded-xl text-center font-display text-2xl font-bold select-none ${
                              winner === "B" ? "bg-info/20 text-info ring-2 ring-info/30" : "bg-muted/50 text-foreground"
                            }`}
                          >
                            {mu.scoreB}
                          </div>
                          <button
                            onClick={() => updateScore(idx, "B", -1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-90 active:bg-primary/20 transition-all select-none"
                          >
                            −
                          </button>
                        </div>
                      </div>

                      <TeamLabelWithElo
                        players={mu.teamB}
                        side="right"
                        delta={eloPreview.perMatch[idx]?.delta || {}}
                        showDelta={!!winner && !isTied}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            {allValid && (
              <div className="mt-5 rounded-2xl border border-border bg-background/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {isSingles ? "Resultado do Confronto" : "Resumo do Rei da Quadra"}
                  </span>
                </div>
                <div className="space-y-2">
                  {selectedPlayers
                    .sort((a, b) => {
                      const diff = (playerPoints[b]?.wins || 0) - (playerPoints[a]?.wins || 0);
                      if (diff !== 0) return diff;
                      return ((playerPoints[b]?.gamesWon || 0) - (playerPoints[b]?.gamesLost || 0)) -
                             ((playerPoints[a]?.gamesWon || 0) - (playerPoints[a]?.gamesLost || 0));
                    })
                    .map((uid, i) => {
                      const pp = playerPoints[uid];
                      const ranking = playerRankings[uid];
                      const isWinner = i === 0;
                      const posChange = ranking?.prevPosition && ranking?.position
                        ? ranking.prevPosition - ranking.position
                        : null;
                      const totalDelta = eloPreview.totals[uid] ?? 0;
                      const projectedRating = (ranking?.rating ?? 1000) + totalDelta;
                      const positiveDelta = totalDelta > 0;
                      const negativeDelta = totalDelta < 0;
                      return (
                        <div
                          key={uid}
                          className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 ${
                            isWinner ? "bg-primary/10 border border-primary/20" : ""
                          }`}
                        >
                          <span className={`w-5 text-sm font-bold ${isWinner ? "text-primary" : "text-muted-foreground"}`}>
                            {i + 1}º
                          </span>
                          <PlayerAvatar uid={uid} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-sm font-medium truncate ${isWinner ? "text-primary font-bold" : "text-foreground"}`}>
                                {getDisplayName(uid)}
                              </span>
                              {posChange !== null && posChange !== 0 && (
                                <span className={`flex items-center text-[10px] font-bold ${posChange > 0 ? "text-success" : "text-destructive"}`}>
                                  {posChange > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                                  {Math.abs(posChange)}
                                </span>
                              )}
                            </div>
                            {ranking && (
                              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground tabular-nums">
                                <span>{Math.round(ranking.rating)} → {Math.round(projectedRating)} Elo</span>
                                <span
                                  className={`font-bold ${
                                    positiveDelta ? "text-success" : negativeDelta ? "text-destructive" : "text-muted-foreground"
                                  }`}
                                >
                                  {formatEloDelta(totalDelta)}
                                </span>
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-bold text-success">{pp.wins}V</span>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{pp.gamesWon}–{pp.gamesLost}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!allValid || submitting}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-40 transition-opacity"
            >
              <Save className="h-4 w-4" />
              {submitting ? "Salvando..." : "Salvar Resultados e Calcular Elo"}
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
