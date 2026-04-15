import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { submitMatchScore } from "@/lib/elo-engine";
import { X, Check, ChevronRight, Save, Swords, Users, Trophy } from "lucide-react";
import { toast } from "sonner";

interface GroupMember {
  user_id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
}

interface Matchup {
  teamA: [string, string];
  teamB: [string, string];
  scoreA: number;
  scoreB: number;
}

interface Props {
  roundId: string;
  groupId: string;
  onClose: () => void;
  onSaved: () => void;
}

// Generate all "Rei da Quadra" matchups for 4 players
// A/B vs C/D, A/C vs B/D, A/D vs B/C
function generateMatchups(players: string[]): Matchup[] {
  if (players.length !== 4) return [];
  const [a, b, c, d] = players;
  return [
    { teamA: [a, b], teamB: [c, d], scoreA: 0, scoreB: 0 },
    { teamA: [a, c], teamB: [b, d], scoreA: 0, scoreB: 0 },
    { teamA: [a, d], teamB: [b, c], scoreA: 0, scoreB: 0 },
  ];
}

export function ManualMatchDialog({ roundId, groupId, onClose, onSaved }: Props) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [step, setStep] = useState<"select" | "scores">("select");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const togglePlayer = (uid: string) => {
    setSelectedPlayers((prev) => {
      if (prev.includes(uid)) return prev.filter((id) => id !== uid);
      if (prev.length >= 4) return prev;
      return [...prev, uid];
    });
  };

  const goToScores = () => {
    if (selectedPlayers.length !== 4) return;
    setMatchups(generateMatchups(selectedPlayers));
    setStep("scores");
  };

  const updateScore = (matchIdx: number, team: "A" | "B", delta: number) => {
    setMatchups((prev) =>
      prev.map((m, i) => {
        if (i !== matchIdx) return m;
        const key = team === "A" ? "scoreA" : "scoreB";
        return { ...m, [key]: Math.max(0, Math.min(13, m[key] + delta)) };
      })
    );
  };

  const setScore = (matchIdx: number, team: "A" | "B", value: number) => {
    setMatchups((prev) =>
      prev.map((m, i) => {
        if (i !== matchIdx) return m;
        const key = team === "A" ? "scoreA" : "scoreB";
        return { ...m, [key]: Math.max(0, Math.min(13, value)) };
      })
    );
  };

  const getName = (uid: string) => {
    const m = members.find((x) => x.user_id === uid);
    return m?.nickname || m?.name || "?";
  };

  const getAvatar = (uid: string) => members.find((x) => x.user_id === uid)?.avatar_url;

  const getInitial = (uid: string) => getName(uid).charAt(0).toUpperCase();

  // Check all matches have a clear winner (not tied)
  const allValid = matchups.every((m) => m.scoreA !== m.scoreB);

  // Player points summary
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

  const handleSubmit = async () => {
    if (!allValid) {
      toast.error("Todos os jogos precisam ter um vencedor (sem empates)");
      return;
    }
    setSubmitting(true);
    try {
      // 1. Upsert presence
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

      // 2. Create matches, players, sets, and process scores
      for (let i = 0; i < matchups.length; i++) {
        const mu = matchups[i];
        const { data: match, error } = await supabase
          .from("matches")
          .insert({ round_id: roundId, match_number: i + 1, status: "scheduled" })
          .select()
          .single();
        if (error) throw error;

        const players = [
          ...mu.teamA.map((uid) => ({ match_id: match.id, user_id: uid, team: "A" })),
          ...mu.teamB.map((uid) => ({ match_id: match.id, user_id: uid, team: "B" })),
        ];
        await supabase.from("match_players").insert(players);

        // Get season_id from round
        const { data: roundData } = await supabase
          .from("rounds")
          .select("season_id")
          .eq("id", roundId)
          .single();

        const seasonId = roundData?.season_id || "";

        // Submit score (creates sets, updates match, processes Elo)
        await submitMatchScore(match.id, seasonId, [
          { setNumber: 1, scoreA: mu.scoreA, scoreB: mu.scoreB },
        ]);
      }

      // 3. Update round status
      await supabase.from("rounds").update({ status: "completed" }).eq("id", roundId);

      toast.success("Rei da Quadra registrado com sucesso!");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  };

  const PlayerAvatar = ({ uid, size = "sm" }: { uid: string; size?: "sm" | "md" }) => {
    const s = size === "sm" ? "h-6 w-6" : "h-8 w-8";
    const textSize = size === "sm" ? "text-[9px]" : "text-xs";
    const av = getAvatar(uid);
    if (av) return <img src={av} alt="" className={`${s} rounded-full object-cover`} />;
    return (
      <div className={`flex ${s} items-center justify-center rounded-full bg-muted ${textSize} font-bold text-foreground`}>
        {getInitial(uid)}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-border bg-card p-5 pb-10 sm:pb-6 animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold text-foreground">
              {step === "select" ? "Quem jogou?" : "Preencher Resultados"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-muted p-2">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : step === "select" ? (
          /* STEP 1: Select 4 players */
          <div>
            <p className="mb-3 text-xs text-muted-foreground">
              Selecione os <strong>4 jogadores</strong> que participaram do Rei da Quadra.
            </p>
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {selectedPlayers.length}/4 selecionados
              </span>
            </div>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {members.map((m) => {
                const isSelected = selectedPlayers.includes(m.user_id);
                const isDisabled = !isSelected && selectedPlayers.length >= 4;
                return (
                  <button
                    key={m.user_id}
                    onClick={() => togglePlayer(m.user_id)}
                    disabled={isDisabled}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "border border-primary/30 bg-primary/10"
                        : isDisabled
                        ? "opacity-40 cursor-not-allowed"
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
              disabled={selectedPlayers.length !== 4}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              Montar Jogos
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* STEP 2: Fill scores for all 3 matchups */
          <div>
            <button
              onClick={() => setStep("select")}
              className="mb-3 text-xs text-primary font-medium"
            >
              ← Alterar jogadores
            </button>

            <p className="mb-4 text-xs text-muted-foreground">
              Cada jogo é <strong>1 set</strong>. Preencha o placar de cada confronto.
            </p>

            <div className="space-y-3">
              {matchups.map((mu, idx) => {
                const winner = mu.scoreA > mu.scoreB ? "A" : mu.scoreB > mu.scoreA ? "B" : null;
                return (
                  <div
                    key={idx}
                    className={`rounded-2xl border p-4 transition-colors ${
                      winner ? "border-border bg-card/50" : "border-warning/30 bg-warning/5"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Jogo {idx + 1}
                      </span>
                      {winner && (
                        <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[9px] font-semibold text-success">
                          <Trophy className="h-3 w-3" />
                          {winner === "A" ? `${getName(mu.teamA[0])} & ${getName(mu.teamA[1])}` : `${getName(mu.teamB[0])} & ${getName(mu.teamB[1])}`}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Team A */}
                      <div className="flex-1">
                        <div className="mb-2 flex items-center gap-1">
                          <PlayerAvatar uid={mu.teamA[0]} />
                          <PlayerAvatar uid={mu.teamA[1]} />
                          <span className="ml-1 text-[10px] text-muted-foreground truncate">
                            {getName(mu.teamA[0]).split(" ")[0]} & {getName(mu.teamA[1]).split(" ")[0]}
                          </span>
                        </div>
                      </div>

                      {/* Score */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateScore(idx, "A", -1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-95"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          value={mu.scoreA}
                          onChange={(e) => setScore(idx, "A", parseInt(e.target.value) || 0)}
                          className="w-10 rounded-lg bg-background text-center font-display text-lg font-bold text-primary outline-none"
                        />
                        <button
                          onClick={() => updateScore(idx, "A", 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-95"
                        >
                          +
                        </button>
                      </div>

                      <span className="text-xs text-muted-foreground font-bold">×</span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateScore(idx, "B", -1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-95"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          value={mu.scoreB}
                          onChange={(e) => setScore(idx, "B", parseInt(e.target.value) || 0)}
                          className="w-10 rounded-lg bg-background text-center font-display text-lg font-bold text-info outline-none"
                        />
                        <button
                          onClick={() => updateScore(idx, "B", 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-95"
                        >
                          +
                        </button>
                      </div>

                      {/* Team B */}
                      <div className="flex-1">
                        <div className="mb-2 flex items-center justify-end gap-1">
                          <span className="mr-1 text-[10px] text-muted-foreground truncate">
                            {getName(mu.teamB[0]).split(" ")[0]} & {getName(mu.teamB[1]).split(" ")[0]}
                          </span>
                          <PlayerAvatar uid={mu.teamB[0]} />
                          <PlayerAvatar uid={mu.teamB[1]} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary table */}
            {allValid && (
              <div className="mt-4 rounded-2xl border border-border bg-background p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Resumo
                </p>
                <div className="space-y-1.5">
                  {selectedPlayers
                    .sort((a, b) => (playerPoints[b]?.wins || 0) - (playerPoints[a]?.wins || 0))
                    .map((uid, i) => {
                      const pp = playerPoints[uid];
                      return (
                        <div key={uid} className="flex items-center gap-2">
                          <span className="w-4 text-[10px] font-bold text-muted-foreground">{i + 1}.</span>
                          <PlayerAvatar uid={uid} />
                          <span className="flex-1 text-xs font-medium text-foreground truncate">{getName(uid)}</span>
                          <span className="text-[10px] font-semibold text-success">{pp.wins}V</span>
                          <span className="text-[10px] text-muted-foreground">{pp.gamesWon}-{pp.gamesLost}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!allValid || submitting}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {submitting ? "Salvando..." : "Salvar Resultados e Calcular Elo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
