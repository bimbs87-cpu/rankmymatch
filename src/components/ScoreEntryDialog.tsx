import { useState, useMemo, useEffect, useRef } from "react";
import { submitMatchScore, previewMatchEloChanges } from "@/lib/elo-engine";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerAvatarLink, PlayerNameLink } from "@/components/PlayerProfileViewer";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { X, Save, Trophy, AlertCircle, Send, Check, ThumbsDown, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  submitPendingResult,
  approvePendingResult,
  rejectPendingResult,
  useMatchPendingResult,
} from "@/lib/pending-results";

interface Props {
  matchId: string;
  seasonId: string;
  matchNumber: number;
  teamA: { name: string; avatarUrl?: string; userId?: string }[];
  teamB: { name: string; avatarUrl?: string; userId?: string }[];
  existingSets?: { setNumber: number; scoreA: number; scoreB: number }[];
  setsPerMatch?: number; // 1 or 3, from season config
  /**
   * - "fixed": respect setsPerMatch strictly (default)
   * - "flexible": allow extra sets up to a soft cap of 9
   * - "unlimited": no cap (rivalry mode)
   */
  setsMode?: "fixed" | "flexible" | "unlimited";
  isSingles?: boolean;
  /** Total number of matches in the round (e.g. 3 for King of the Court). Used
   * to display "Partida X de Y" in the dialog header. Defaults to 1. */
  totalMatches?: number;
  /** Whether the current user is an admin of the group. Non-admin players
   * submit a pending result that admins must approve. Defaults to true to
   * preserve previous behavior in callers that have not yet been updated. */
  isAdmin?: boolean;
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
  setsMode,
  isSingles = false,
  totalMatches = 1,
  isAdmin = true,
  onClose,
  onSaved,
}: Props) {
  // Backwards-compat: setsPerMatch === 99 used to signal "unlimited" before setsMode existed.
  const effectiveMode: "fixed" | "flexible" | "unlimited" =
    setsMode ?? (setsPerMatch >= 99 ? "unlimited" : "fixed");
  const isUnlimitedSets = effectiveMode === "unlimited";
  const isFlexibleSets = effectiveMode === "flexible";
  const FLEX_CAP = 9;
  const maxSets = isUnlimitedSets
    ? 99
    : isFlexibleSets
    ? FLEX_CAP
    : setsPerMatch;

  // Pending result for this match (if any). Admins see "approve/edit/reject".
  const { pending, refresh: refreshPending } = useMatchPendingResult(matchId);

  // Initial sets: prefer existing official sets; otherwise prefill from
  // pending submission so the admin sees what the player proposed.
  const initialSets = existingSets?.length
    ? existingSets.map((s) => ({ scoreA: s.scoreA, scoreB: s.scoreB }))
    : pending?.sets?.length
    ? pending.sets.map((s) => ({ scoreA: s.scoreA, scoreB: s.scoreB }))
    : [{ scoreA: 0, scoreB: 0 }];

  const [sets, setSets] = useState<{ scoreA: number; scoreB: number }[]>(initialSets);
  const [submitting, setSubmitting] = useState(false);
  const [saveStep, setSaveStep] = useState(0);
  const [saveStepLabel, setSaveStepLabel] = useState("");
  const [playerStats, setPlayerStats] = useState<Record<string, { rating: number; matchesPlayed: number }>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userEdited, setUserEdited] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data?.user?.id ?? null);
    });
  }, []);

  const isPlayerInMatch = useMemo(() => {
    if (!currentUserId) return false;
    return [...teamA, ...teamB].some((p) => p.userId === currentUserId);
  }, [currentUserId, teamA, teamB]);

  // When a pending result arrives async (and no official sets), prefill the
  // form so the admin sees what the player proposed — unless the user has
  // already started editing.
  useEffect(() => {
    if (userEdited) return;
    if (existingSets?.length) return;
    if (pending?.sets?.length) {
      setSets(pending.sets.map((s) => ({ scoreA: s.scoreA, scoreB: s.scoreB })));
    }
  }, [pending, existingSets, userEdited]);

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
    setUserEdited(true);
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
      setUserEdited(true);
      setSets([...sets, { scoreA: 0, scoreB: 0 }]);
    }
  };

  const removeLastSet = () => {
    if (sets.length > 1) {
      setUserEdited(true);
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
    let isDraw = false;
    let canSubmit = false;

    if (isUnlimitedSets || isFlexibleSets) {
      // Flexible/Unlimited (rivalry/avulso): leader by sets; if tied in sets,
      // fall back to total games. If still tied, allow a DRAW.
      if (allValid && setResults.some((r) => r.valid)) {
        if (setsA !== setsB) {
          matchWinner = setsA > setsB ? "A" : "B";
          canSubmit = true;
        } else if (gamesA !== gamesB) {
          matchWinner = gamesA > gamesB ? "A" : "B";
          canSubmit = true;
        } else {
          isDraw = true;
          canSubmit = true;
        }
      }
    } else {
      const neededToWin = maxSets === 1 ? 1 : 2;
      matchWinner = setsA >= neededToWin ? "A" : setsB >= neededToWin ? "B" : null;
      canSubmit = matchWinner !== null && allValid;
    }

    // Whether to allow adding another set
    const needsMoreSets =
      isUnlimitedSets || isFlexibleSets
        ? allValid && setResults.some((r) => r.valid) && sets.length < maxSets
        : !matchWinner && sets.length < maxSets && allValid && setResults.some((r) => r.valid);

    return { setsA, setsB, gamesA, gamesB, setResults, matchWinner, canSubmit, needsMoreSets };
  }, [sets, maxSets, isUnlimitedSets, isFlexibleSets]);

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
      // Audit: was this an EDIT (existing sets) or a fresh entry? Only log edits
      // to keep the audit panel focused on meaningful admin overrides.
      const isEdit = !!(existingSets && existingSets.length > 0);
      let groupIdForNotify: string | null = null;
      let roundIdForNotify: string | null = null;
      try {
        const { data: round } = await supabase
          .from("matches")
          .select("round_id, rounds:rounds!inner(group_id)")
          .eq("id", matchId)
          .maybeSingle();
        groupIdForNotify =
          (round?.rounds as unknown as { group_id: string } | null)?.group_id || null;
        roundIdForNotify = (round?.round_id as string | null) || null;
        if (isEdit && groupIdForNotify) {
          const { logAudit } = await import("@/lib/audit-log");
          await logAudit({
            groupId: groupIdForNotify,
            action: "match_score_edited",
            entityType: "match",
            entityId: matchId,
            oldData: { sets: existingSets },
            newData: { sets, winnerTeam: result.winnerTeam, setsA: result.setsA, setsB: result.setsB },
          });
        }
      } catch {
        /* best effort */
      }

      // Fan-out notification + push to the involved players (excluding actor).
      // Only on FRESH score entry — not on edits — to avoid duplicate pings.
      if (!isEdit && groupIdForNotify) {
        try {
          const playerIds = [...teamA, ...teamB]
            .map((p) => p.userId)
            .filter((u): u is string => !!u);
          const { data: currentUser } = await supabase.auth.getUser();
          const actorId = currentUser?.user?.id || "";
          const targets = playerIds.filter((u) => u !== actorId);
          if (targets.length > 0) {
            const { notifyUsers } = await import("@/lib/notify");
            void notifyUsers(targets, {
              groupId: groupIdForNotify,
              actorId,
              type: "match_result",
              title: "Resultado registrado! 🏆",
              body: isSingles
                ? `${winnerName} venceu por ${result.setsA}x${result.setsB}. Confira o resultado!`
                : `Time ${result.winnerTeam} venceu ${result.setsA}x${result.setsB}. Confira o resultado!`,
              data: { matchId, seasonId, roundId: roundIdForNotify },
              url: roundIdForNotify
                ? `/groups/${groupIdForNotify}?view=seasons&season=${seasonId}&round=${roundIdForNotify}`
                : `/groups/${groupIdForNotify}`,
            }).catch(() => {});
          }
        } catch {
          /* push is optional */
        }
      }

      toast.success(
        isSingles
          ? `${winnerName} venceu por ${result.setsA} set${result.setsA > 1 ? "s" : ""} a ${result.setsB}!`
          : `Partida finalizada! Time ${result.winnerTeam} venceu ${result.setsA}-${result.setsB}`
      );
      void import("@/lib/analytics").then(({ trackConversion }) =>
        trackConversion("register_match", { match_id: matchId, season_id: seasonId, mode: isSingles ? "singles" : "doubles", source: "admin_save" }),
      );
      void import("@/lib/onboarding-events").then(({ trackOnboardingStep }) =>
        trackOnboardingStep("first_match_result", { match_id: matchId, source: "admin_save" }),
      );
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar placar");
    } finally {
      setSubmitting(false);
    }
  };

  // Player (non-admin) submits a pending result for admin approval.
  const handleSubmitPending = async () => {
    if (!matchState.canSubmit) {
      toast.error("Corrija os placares antes de enviar");
      return;
    }
    setSubmitting(true);
    try {
      await submitPendingResult({
        matchId,
        sets: sets.map((s, i) => ({ setNumber: i + 1, scoreA: s.scoreA, scoreB: s.scoreB })),
      });
      // Notify group admins (push + in-app)
      try {
        const { data: round } = await supabase
          .from("matches")
          .select("round_id, rounds:rounds!inner(group_id)")
          .eq("id", matchId)
          .maybeSingle();
        const groupId = (round?.rounds as unknown as { group_id: string } | null)?.group_id || null;
        const roundId = (round?.round_id as string | null) || null;
        if (groupId) {
          const { data: admins } = await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", groupId)
            .eq("status", "active")
            .in("role", ["creator", "admin"]);
          const targetIds = (admins || []).map((a) => a.user_id);
          if (targetIds.length) {
            const { notifyUsers } = await import("@/lib/notify");
            const { data: u } = await supabase.auth.getUser();
            const actorId = u?.user?.id || "";
            void notifyUsers(targetIds, {
              groupId,
              actorId,
              type: "result_pending",
              title: "Resultado aguardando aprovação ⏳",
              body: `${playerAName} vs ${playerBName}: ${sets.map((s) => `${s.scoreA}-${s.scoreB}`).join(" • ")}`,
              data: { matchId, seasonId, roundId },
              url: roundId ? `/groups/${groupId}?view=seasons&season=${seasonId}&round=${roundId}` : `/groups/${groupId}`,
            }).catch(() => {});
          }
        }
      } catch {
        /* best-effort */
      }
      toast.success("Resultado enviado para aprovação do admin");
      void import("@/lib/analytics").then(({ trackConversion }) =>
        trackConversion("register_match", { match_id: matchId, season_id: seasonId, source: "player_pending" }),
      );
      void import("@/lib/onboarding-events").then(({ trackOnboardingStep }) =>
        trackOnboardingStep("first_match_result", { match_id: matchId, source: "player_pending" }),
      );
      await refreshPending();
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar resultado");
    } finally {
      setSubmitting(false);
    }
  };

  // Admin approves the pending result (with current sets — admin may have edited).
  const handleApprovePending = async () => {
    if (!pending) return;
    if (!matchState.canSubmit) {
      toast.error("Corrija os placares antes de aprovar");
      return;
    }
    setSubmitting(true);
    try {
      await waitForNextPaint();
      await approvePendingResult({
        pendingId: pending.id,
        matchId,
        seasonId,
        sets: sets.map((s, i) => ({ setNumber: i + 1, scoreA: s.scoreA, scoreB: s.scoreB })),
      });
      // Notify the submitter that their result was approved
      try {
        const { data: round } = await supabase
          .from("matches")
          .select("round_id, rounds:rounds!inner(group_id)")
          .eq("id", matchId)
          .maybeSingle();
        const groupId = (round?.rounds as unknown as { group_id: string } | null)?.group_id || null;
        const roundId = (round?.round_id as string | null) || null;
        if (groupId && pending.submitted_by) {
          const { notifyUsers } = await import("@/lib/notify");
          const { data: u } = await supabase.auth.getUser();
          void notifyUsers([pending.submitted_by], {
            groupId,
            actorId: u?.user?.id || "",
            type: "result_approved",
            title: "Seu resultado foi aprovado ✅",
            body: `${playerAName} vs ${playerBName}: ${sets.map((s) => `${s.scoreA}-${s.scoreB}`).join(" • ")}`,
            data: { matchId, seasonId, roundId },
            url: roundId ? `/groups/${groupId}?view=seasons&season=${seasonId}&round=${roundId}` : `/groups/${groupId}`,
          }).catch(() => {});
        }
      } catch {
        /* best-effort */
      }
      toast.success("Resultado aprovado e ranking atualizado!");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao aprovar resultado");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectPending = async () => {
    if (!pending) return;
    if (!confirm("Rejeitar este resultado? O jogador poderá reenviar.")) return;
    setSubmitting(true);
    try {
      await rejectPendingResult(pending.id);
      // Notify submitter
      try {
        const { data: round } = await supabase
          .from("matches")
          .select("round_id, rounds:rounds!inner(group_id)")
          .eq("id", matchId)
          .maybeSingle();
        const groupId = (round?.rounds as unknown as { group_id: string } | null)?.group_id || null;
        const roundId = (round?.round_id as string | null) || null;
        if (groupId && pending.submitted_by) {
          const { notifyUsers } = await import("@/lib/notify");
          const { data: u } = await supabase.auth.getUser();
          void notifyUsers([pending.submitted_by], {
            groupId,
            actorId: u?.user?.id || "",
            type: "result_rejected",
            title: "Seu resultado foi rejeitado",
            body: "O admin pediu revisão do placar. Confira a partida.",
            data: { matchId, seasonId, roundId },
            url: roundId ? `/groups/${groupId}?view=seasons&season=${seasonId}&round=${roundId}` : `/groups/${groupId}`,
          }).catch(() => {});
        }
      } catch { /* best-effort */ }
      toast.success("Resultado rejeitado");
      await refreshPending();
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao rejeitar");
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
              {totalMatches > 1 && (
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  de {totalMatches}
                </span>
              )}
            </h2>
            <button onClick={onClose} disabled={submitting} className="rounded-full bg-muted p-2 disabled:opacity-50">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <p className="mb-5 text-xs text-muted-foreground">
            {totalMatches > 1
              ? isSingles
                ? `${totalMatches} confrontos no total`
                : `${totalMatches} partidas no total`
              : isSingles
              ? "1 confronto"
              : "1 partida"}
            {isUnlimitedSets
              ? " • sets livres"
              : isFlexibleSets
              ? ` • melhor de ${setsPerMatch} sets (sets extras permitidos)`
              : maxSets === 1
              ? " • 1 set"
              : ` • melhor de ${maxSets} sets`}
          </p>

          {isSingles ? (
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlayerAvatarLink userId={teamA[0]?.userId} ariaLabel={`Ver perfil de ${playerAName}`}>
                  <PlayerAvatar avatarUrl={teamA[0]?.avatarUrl || null} name={playerAName} size="md" className="ring-2 ring-primary/30" />
                </PlayerAvatarLink>
                <div className="flex flex-col">
                  <PlayerNameLink userId={teamA[0]?.userId} className="text-sm font-semibold text-primary leading-tight">{playerAName}</PlayerNameLink>
                  {renderEloBadge(teamA[0]?.userId)}
                </div>
              </div>
              <span className="text-xs font-bold text-muted-foreground">VS</span>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-end">
                  <PlayerNameLink userId={teamB[0]?.userId} className="text-sm font-semibold text-info leading-tight">{playerBName}</PlayerNameLink>
                  {renderEloBadge(teamB[0]?.userId)}
                </div>
                <PlayerAvatarLink userId={teamB[0]?.userId} ariaLabel={`Ver perfil de ${playerBName}`}>
                  <PlayerAvatar avatarUrl={teamB[0]?.avatarUrl || null} name={playerBName} size="md" className="ring-2 ring-info/30" />
                </PlayerAvatarLink>
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

          {/* Pending banner: visible to admins when there is a pending submission */}
          {pending && isAdmin && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/5 p-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs text-foreground/80">
                Resultado enviado para aprovação. Edite os sets se necessário e aprove,
                ou rejeite para o jogador reenviar.
              </p>
            </div>
          )}

          {/* Action buttons: depend on admin/pending state */}
          {isAdmin ? (
            pending ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={handleRejectPending}
                  disabled={submitting}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 py-3.5 text-sm font-bold text-destructive disabled:opacity-50"
                >
                  <ThumbsDown className="h-4 w-4" />
                  Rejeitar
                </button>
                <button
                  onClick={handleApprovePending}
                  disabled={!matchState.canSubmit || submitting}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  {submitting ? "Aprovando..." : "Aprovar"}
                </button>
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!matchState.canSubmit || submitting}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {submitting ? "Salvando resultado..." : "Salvar Placar e Calcular Elo"}
              </button>
            )
          ) : isPlayerInMatch ? (
            <button
              onClick={handleSubmitPending}
              disabled={!matchState.canSubmit || submitting || (!!pending && pending.submitted_by !== currentUserId)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {submitting
                ? "Enviando..."
                : pending
                ? pending.submitted_by === currentUserId
                  ? "Reenviar para aprovação"
                  : "Aguardando aprovação do admin"
                : "Enviar para aprovação do admin"}
            </button>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-border bg-muted/10 py-3 text-center text-xs text-muted-foreground">
              Apenas jogadores da partida ou admins podem lançar o resultado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
