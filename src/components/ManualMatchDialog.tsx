import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { submitMatchScore } from "@/lib/elo-engine";
import { X, Check, ChevronRight, Save, Swords, Users, Trophy, Crown } from "lucide-react";
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

  const handleSubmit = async () => {
    if (!allValid) {
      toast.error("Todos os jogos precisam ter um vencedor (sem empates)");
      return;
    }
    setSubmitting(true);
    try {
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

      // Notify all involved players
      if (roundData?.group_id) {
        const { data: currentUser } = await supabase.auth.getUser();
        const actorId = currentUser?.user?.id || "";
        const playerNames = selectedPlayers.map((uid) => getDisplayName(uid)).join(", ");
        
        // Notify each player individually
        const notifRows = selectedPlayers
          .filter((uid) => uid !== actorId)
          .map((uid) => ({
            user_id: uid,
            group_id: roundData.group_id,
            type: "match_result",
            title: "Resultado registrado! 🏆",
            body: `Rodada ${roundData.round_number} — Rei da Quadra com ${playerNames}. Confira o resultado!`,
            data: { roundId, seasonId },
          }));
        
        if (notifRows.length > 0) {
          await supabase.from("notifications").insert(notifRows);
        }
      }

      toast.success("Rei da Quadra registrado com sucesso!");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  };

  const PlayerAvatar = ({ uid, size = "sm" }: { uid: string; size?: "sm" | "md" | "lg" }) => {
    const sizes = { sm: "h-7 w-7", md: "h-9 w-9", lg: "h-10 w-10" };
    const textSizes = { sm: "text-[10px]", md: "text-xs", lg: "text-sm" };
    const av = getAvatar(uid);
    if (av) return <img src={av} alt="" className={`${sizes[size]} rounded-full object-cover ring-2 ring-border`} />;
    return (
      <div className={`flex ${sizes[size]} items-center justify-center rounded-full bg-muted ring-2 ring-border ${textSizes[size]} font-bold text-foreground`}>
        {getInitial(uid)}
      </div>
    );
  };

  const TeamLabel = ({ players, side }: { players: [string, string]; side: "left" | "right" }) => (
    <div className={`flex flex-col gap-1 ${side === "right" ? "items-end" : "items-start"}`}>
      {players.map((uid) => (
        <div key={uid} className={`flex items-center gap-2 ${side === "right" ? "flex-row-reverse" : ""}`}>
          <PlayerAvatar uid={uid} />
          <span className="text-sm font-medium text-foreground">{getDisplayName(uid)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-border bg-card p-5 pb-10 sm:pb-6 animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Swords className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">
                {step === "select" ? "Quem jogou?" : "Preencher Resultados"}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {step === "select" ? "Selecione 4 jogadores" : "3 jogos · 1 set cada"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full bg-muted/50 p-2 hover:bg-muted transition-colors">
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
                {selectedPlayers.length}/4 selecionados
              </span>
              {selectedPlayers.length === 4 && (
                <Check className="h-4 w-4 text-success ml-auto" />
              )}
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {members.map((m) => {
                const isSelected = selectedPlayers.includes(m.user_id);
                const isDisabled = !isSelected && selectedPlayers.length >= 4;
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
              disabled={selectedPlayers.length !== 4}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-40 transition-opacity"
            >
              Montar Jogos
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setStep("select")}
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
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Jogo {idx + 1}
                      </span>
                      {winner ? (
                        <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-[10px] font-semibold text-success">
                          <Trophy className="h-3 w-3" />
                          Vitória
                        </span>
                      ) : isTied ? (
                        <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-[10px] font-semibold text-warning">
                          Empate
                        </span>
                      ) : null}
                    </div>

                    {/* Teams + Score */}
                    <div className="flex items-center gap-3">
                      {/* Team A */}
                      <TeamLabel players={mu.teamA} side="left" />

                      {/* Score controls */}
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

                      {/* Team B */}
                      <TeamLabel players={mu.teamB} side="right" />
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
                    Resumo do Rei da Quadra
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
                      const isKing = i === 0;
                      return (
                        <div
                          key={uid}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                            isKing ? "bg-primary/10 border border-primary/20" : ""
                          }`}
                        >
                          <span className={`w-5 text-sm font-bold ${isKing ? "text-primary" : "text-muted-foreground"}`}>
                            {i + 1}º
                          </span>
                          <PlayerAvatar uid={uid} />
                          <span className={`flex-1 text-sm font-medium ${isKing ? "text-primary" : "text-foreground"}`}>
                            {getDisplayName(uid)}
                            {isKing && " 👑"}
                          </span>
                          <span className="text-xs font-bold text-success">{pp.wins}V</span>
                          <span className="text-[11px] text-muted-foreground">{pp.gamesWon}–{pp.gamesLost}</span>
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
  );
}
