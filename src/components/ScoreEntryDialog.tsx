import { useState, useMemo, useEffect, useRef } from "react";
import { submitMatchScore, previewMatchEloChanges } from "@/lib/elo-engine";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { X, Save, Trophy, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  matchId: string;
  seasonId: string;
  matchNumber: number;
  teamA: { name: string; avatarUrl?: string; userId?: string }[];
  teamB: { name: string; avatarUrl?: string; userId?: string }[];
  existingSets?: { setNumber: number; scoreA: number; scoreB: number }[];
  setsPerMatch?: number; // 1 or 3, from season config
  isSingles?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function isValidSetScore(a: number, b: number): { valid: boolean; reason?: string } {
  if (a === b) return { valid: false, reason: "Empate não é permitido" };
  if (a === 0 && b === 0) return { valid: false, reason: "Placar vazio" };
  // Standard tennis/padel: 6-X or X-6 with valid margins
  const winner = Math.max(a, b);
  const loser = Math.min(a, b);
  if (winner === 6 && loser <= 4) return { valid: true };
  if (winner === 7 && (loser === 5 || loser === 6)) return { valid: true };
  // Allow tiebreak-like scores
  if (winner > 7) return { valid: false, reason: `Placar máximo é 7` };
  if (winner < 6) return { valid: false, reason: `Mínimo 6 games para vencer` };
  return { valid: false, reason: "Placar inválido" };
}

export function ScoreEntryDialog({
  matchId,
  seasonId,
  matchNumber,
  teamA,
  teamB,
  existingSets,
  setsPerMatch = 3,
  isSingles = false,
  onClose,
  onSaved,
}: Props) {
  const isUnlimitedSets = setsPerMatch >= 99;
  const maxSets = isUnlimitedSets ? 99 : setsPerMatch;
  const initialSets = existingSets?.length
    ? existingSets.map((s) => ({ scoreA: s.scoreA, scoreB: s.scoreB }))
    : [{ scoreA: 0, scoreB: 0 }];

  const [sets, setSets] = useState<{ scoreA: number; scoreB: number }[]>(initialSets);
  const [submitting, setSubmitting] = useState(false);
  const [saveStep, setSaveStep] = useState(0);
  const [saveStepLabel, setSaveStepLabel] = useState("");
  const [playerStats, setPlayerStats] = useState<Record<string, { rating: number; matchesPlayed: number }>>({});

  // Load current rating snapshots for preview of Elo deltas while typing
  useEffect(() => {
    const ids = [...teamA, ...teamB].map((p) => p.userId).filter(Boolean) as string[];
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ranking_snapshots")
        .select("user_id, rating, matches_played")
        .eq("season_id", seasonId)
        .in("user_id", ids);
      if (cancelled) return;
      const map: Record<string, { rating: number; matchesPlayed: number }> = {};
      for (const id of ids) {
        const snap = data?.find((d) => d.user_id === id);
        map[id] = {
          rating: snap ? Number(snap.rating) : 1000,
          matchesPlayed: snap?.matches_played ?? 0,
        };
      }
      setPlayerStats(map);
    })();
    return () => { cancelled = true; };
  }, [seasonId, matchId]);

  const waitForNextPaint = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  // Animate through save steps to give visual feedback
  const saveSteps = useRef([
    "Salvando sets...",
    "Calculando vencedor...",
    "Atualizando presença...",
    "Calculando Elo...",
    "Atualizando ranking...",
    "Finalizando...",
  ]);

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
      step++;
      if (step <= saveSteps.current.length) {
        setSaveStep(step);
        setSaveStepLabel(saveSteps.current[step - 1]);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [submitting]);

  const updateScore = (setIndex: number, team: "A" | "B", value: number) => {
    setSets((prev) =>
      prev.map((s, i) =>
        i === setIndex
          ? { ...s, [team === "A" ? "scoreA" : "scoreB"]: Math.max(0, Math.min(7, value)) }
          : s
      )
    );
  };

  const addSet = () => {
    if (sets.length < maxSets) {
      setSets([...sets, { scoreA: 0, scoreB: 0 }]);
    }
  };

  const removeLastSet = () => {
    if (sets.length > 1) {
      setSets(sets.slice(0, -1));
    }
  };

  // Compute match state
  const matchState = useMemo(() => {
    let setsA = 0, setsB = 0, gamesA = 0, gamesB = 0;
    const setResults: { winner: "A" | "B" | null; valid: boolean; reason?: string }[] = [];

    for (const s of sets) {
      gamesA += s.scoreA;
      gamesB += s.scoreB;
      if (s.scoreA === 0 && s.scoreB === 0) {
        setResults.push({ winner: null, valid: false, reason: "Placar vazio" });
        continue;
      }
      const validation = isValidSetScore(s.scoreA, s.scoreB);
      if (!validation.valid) {
        setResults.push({ winner: null, valid: false, reason: validation.reason });
        continue;
      }
      const winner = s.scoreA > s.scoreB ? "A" as const : "B" as const;
      if (winner === "A") setsA++;
      else setsB++;
      setResults.push({ winner, valid: true });
    }

    const allValid = setResults.every((r) => r.valid);

    let matchWinner: "A" | "B" | null = null;
    let canSubmit = false;

    if (isUnlimitedSets) {
      // Rivalry: any valid set count, whoever has more sets wins
      if (allValid && setsA !== setsB && setResults.some(r => r.valid)) {
        matchWinner = setsA > setsB ? "A" : "B";
        canSubmit = true;
      }
    } else {
      const neededToWin = maxSets === 1 ? 1 : 2;
      matchWinner = setsA >= neededToWin ? "A" : setsB >= neededToWin ? "B" : null;
      canSubmit = matchWinner !== null && allValid;
    }

    // Check if we need more sets
    const needsMoreSets = isUnlimitedSets
      ? allValid && setResults.some(r => r.valid)
      : !matchWinner && sets.length < maxSets && allValid && setResults.some(r => r.valid);

    return { setsA, setsB, gamesA, gamesB, setResults, matchWinner, canSubmit, needsMoreSets };
  }, [sets, maxSets]);

  // Preview Elo deltas for the current scoreboard (only when there is a winner)
  const eloDeltas = useMemo(() => {
    const idsA = teamA.map((p) => p.userId).filter(Boolean) as string[];
    const idsB = teamB.map((p) => p.userId).filter(Boolean) as string[];
    if (!idsA.length || !idsB.length || !matchState.matchWinner) return {};
    return previewMatchEloChanges({
      teamA: idsA.map((id) => ({
        userId: id,
        rating: playerStats[id]?.rating,
        matchesPlayed: playerStats[id]?.matchesPlayed,
      })),
      teamB: idsB.map((id) => ({
        userId: id,
        rating: playerStats[id]?.rating,
        matchesPlayed: playerStats[id]?.matchesPlayed,
      })),
      setsTeamA: matchState.setsA,
      setsTeamB: matchState.setsB,
      gamesTeamA: matchState.gamesA,
      gamesTeamB: matchState.gamesB,
    });
  }, [matchState, playerStats, teamA, teamB]);

  const formatEloDelta = (delta: number) => {
    if (!delta) return "±0";
    const rounded = Math.round(delta);
    if (rounded === 0) return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
    return `${rounded > 0 ? "+" : ""}${rounded}`;
  };

  const renderEloBadge = (uid?: string) => {
    if (!uid || !matchState.matchWinner) return null;
    const d = eloDeltas[uid] ?? 0;
    const positive = d > 0;
    const negative = d < 0;
    return (
      <span
        className={`mt-0.5 text-[10px] font-bold tabular-nums ${
          positive ? "text-success" : negative ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {formatEloDelta(d)} Elo
      </span>
    );
  };

  const playerAName = teamA[0]?.name || "Jogador A";
  const playerBName = teamB[0]?.name || "Jogador B";

  const handleSubmit = async () => {
    if (!matchState.canSubmit) {
      toast.error("Corrija os placares antes de salvar");
      return;
    }
    setSubmitting(true);
    try {
      await waitForNextPaint();
      const result = await submitMatchScore(
        matchId,
        seasonId,
        sets.map((s, i) => ({ setNumber: i + 1, scoreA: s.scoreA, scoreB: s.scoreB }))
      );
      const winnerName = result.winnerTeam === "A" ? playerAName : playerBName;
      toast.success(
        isSingles
          ? `${winnerName} venceu por ${result.setsA} set${result.setsA > 1 ? "s" : ""} a ${result.setsB}!`
          : `Partida finalizada! Time ${result.winnerTeam} venceu ${result.setsA}-${result.setsB}`
      );
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar placar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pb-24 sm:pb-6">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />
      <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-6 pb-8 sm:pb-6 animate-in zoom-in-95 fade-in-0 duration-200 max-h-[calc(100vh-8rem)] overflow-y-auto sm:max-h-[85vh]">
        {submitting && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/85 px-6 backdrop-blur-md">
            <div className="w-full max-w-sm space-y-4">
              <TrophyLoadingBar
                fullScreen={false}
                progress={Math.min((saveStep / saveSteps.current.length) * 100, 95)}
                label={saveStepLabel || "Processando resultado da partida..."}
              />
              <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-center shadow-xl">
                <p className="text-sm font-semibold text-primary">Salvando resultado da partida</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Não feche esta janela nem navegue para outra aba até concluir.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className={submitting ? "pointer-events-none opacity-20" : ""}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-lg font-bold text-foreground">
              {isSingles ? `Confronto ${matchNumber}` : `Partida ${matchNumber}`}
            </h2>
            <button onClick={onClose} disabled={submitting} className="rounded-full bg-muted p-2 disabled:opacity-50">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <p className="mb-5 text-xs text-muted-foreground">
            {isSingles ? "1 confronto" : "1 partida"}{isUnlimitedSets ? " • adicione sets conforme necessário" : maxSets === 1 ? " • 1 set" : ` • melhor de ${maxSets} sets`}
          </p>

          {isSingles ? (
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlayerAvatar avatarUrl={teamA[0]?.avatarUrl || null} name={playerAName} size="md" className="ring-2 ring-primary/30" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-primary leading-tight">{playerAName}</span>
                  {renderEloBadge(teamA[0]?.userId)}
                </div>
              </div>
              <span className="text-xs font-bold text-muted-foreground">VS</span>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-end">
                  <span className="text-sm font-semibold text-info leading-tight">{playerBName}</span>
                  {renderEloBadge(teamB[0]?.userId)}
                </div>
                <PlayerAvatar avatarUrl={teamB[0]?.avatarUrl || null} name={playerBName} size="md" className="ring-2 ring-info/30" />
              </div>
            </div>
          ) : (
            <div className="mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
              <div className="flex-1 text-primary">
                Time A
                <div className="mt-1 flex flex-wrap gap-1">
                  {teamA.map((p, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                    >
                      {p.name}
                      {p.userId && matchState.matchWinner && (
                        <span
                          className={`tabular-nums font-bold ${
                            (eloDeltas[p.userId] ?? 0) > 0
                              ? "text-success"
                              : (eloDeltas[p.userId] ?? 0) < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {formatEloDelta(eloDeltas[p.userId] ?? 0)}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <div className="px-3 text-muted-foreground">vs</div>
              <div className="flex-1 text-right text-info">
                Time B
                <div className="mt-1 flex flex-wrap justify-end gap-1">
                  {teamB.map((p, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info"
                    >
                      {p.name}
                      {p.userId && matchState.matchWinner && (
                        <span
                          className={`tabular-nums font-bold ${
                            (eloDeltas[p.userId] ?? 0) > 0
                              ? "text-success"
                              : (eloDeltas[p.userId] ?? 0) < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {formatEloDelta(eloDeltas[p.userId] ?? 0)}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(isUnlimitedSets ? sets.length > 1 : maxSets > 1) && (
            <div className="mb-3 flex items-center justify-center gap-3 rounded-2xl bg-muted/30 py-2">
              <span className={`font-display text-2xl font-bold ${matchState.setsA > matchState.setsB ? "text-primary" : "text-muted-foreground"}`}>
                {matchState.setsA}
              </span>
              <span className="text-xs text-muted-foreground">sets</span>
              <span className={`font-display text-2xl font-bold ${matchState.setsB > matchState.setsA ? "text-info" : "text-muted-foreground"}`}>
                {matchState.setsB}
              </span>
            </div>
          )}

          <div className="space-y-3">
            {sets.map((set, idx) => {
              const result = matchState.setResults[idx];
              const isLastAndRemovable = idx === sets.length - 1 && sets.length > 1;
              const setLabel = `Set ${idx + 1}`;

              return (
                <div key={idx} className={`rounded-2xl border p-3 ${
                  result?.valid ? "border-success/30 bg-success/5" : 
                  (set.scoreA > 0 || set.scoreB > 0) && !result?.valid ? "border-warning/30 bg-warning/5" : 
                  "border-border bg-background"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground">{setLabel}</span>
                    <div className="flex items-center gap-2">
                      {result?.valid && result.winner && (
                        <span className={`text-[10px] font-semibold ${result.winner === "A" ? "text-primary" : "text-info"}`}>
                          {isSingles
                            ? (result.winner === "A" ? playerAName : playerBName)
                            : `Time ${result.winner}`
                          } ✓
                        </span>
                      )}
                      {!result?.valid && result?.reason && (set.scoreA > 0 || set.scoreB > 0) && (
                        <span className="flex items-center gap-1 text-[10px] text-warning">
                          <AlertCircle className="h-3 w-3" />
                          {result.reason}
                        </span>
                      )}
                      {isLastAndRemovable && (
                        <button onClick={removeLastSet} className="text-xs text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-1 items-center justify-center gap-2">
                      <button onClick={() => updateScore(idx, "A", set.scoreA - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-95">−</button>
                      <span className={`w-8 text-center font-display text-xl font-bold ${result?.valid && result.winner === "A" ? "text-primary" : "text-foreground"}`}>{set.scoreA}</span>
                      <button onClick={() => updateScore(idx, "A", set.scoreA + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-95">+</button>
                    </div>
                    <span className="text-xs text-muted-foreground">×</span>
                    <div className="flex flex-1 items-center justify-center gap-2">
                      <button onClick={() => updateScore(idx, "B", set.scoreB - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-95">−</button>
                      <span className={`w-8 text-center font-display text-xl font-bold ${result?.valid && result.winner === "B" ? "text-info" : "text-foreground"}`}>{set.scoreB}</span>
                      <button onClick={() => updateScore(idx, "B", set.scoreB + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-95">+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {matchState.needsMoreSets && (
            <button onClick={addSet} className="mt-3 w-full rounded-2xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground">
              + Adicionar Set {sets.length + 1}
            </button>
          )}

          {matchState.matchWinner && matchState.canSubmit && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-success/10 py-2.5">
              <Trophy className="h-4 w-4 text-success" />
              <span className="text-sm font-semibold text-success">
                {isSingles
                  ? `${matchState.matchWinner === "A" ? playerAName : playerBName} venceu ${matchState.setsA}-${matchState.setsB}`
                  : `Time ${matchState.matchWinner} vence ${matchState.setsA}-${matchState.setsB}`
                }
              </span>
            </div>
          )}

          {matchState.matchWinner && matchState.canSubmit && (
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              Sets: {sets.map((s) => `${s.scoreA}-${s.scoreB}`).join(" • ")}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!matchState.canSubmit || submitting}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {submitting ? "Salvando resultado..." : "Salvar Placar e Calcular Elo"}
          </button>
        </div>
      </div>
    </div>
  );
}
