import { useState } from "react";
import { submitMatchScore } from "@/lib/elo-engine";
import { X, Save, Trophy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  matchId: string;
  seasonId: string;
  matchNumber: number;
  teamA: { name: string; avatarUrl?: string }[];
  teamB: { name: string; avatarUrl?: string }[];
  existingSets?: { setNumber: number; scoreA: number; scoreB: number }[];
  onClose: () => void;
  onSaved: () => void;
}

export function ScoreEntryDialog({
  matchId,
  seasonId,
  matchNumber,
  teamA,
  teamB,
  existingSets,
  onClose,
  onSaved,
}: Props) {
  const [sets, setSets] = useState<{ scoreA: number; scoreB: number }[]>(
    existingSets?.length
      ? existingSets.map((s) => ({ scoreA: s.scoreA, scoreB: s.scoreB }))
      : [
          { scoreA: 0, scoreB: 0 },
          { scoreA: 0, scoreB: 0 },
        ]
  );
  const [submitting, setSubmitting] = useState(false);

  const updateScore = (setIndex: number, team: "A" | "B", value: number) => {
    setSets((prev) =>
      prev.map((s, i) =>
        i === setIndex
          ? { ...s, [team === "A" ? "scoreA" : "scoreB"]: Math.max(0, Math.min(13, value)) }
          : s
      )
    );
  };

  const addTiebreak = () => {
    if (sets.length < 3) {
      setSets([...sets, { scoreA: 0, scoreB: 0 }]);
    }
  };

  const removeTiebreak = () => {
    if (sets.length > 2) {
      setSets(sets.slice(0, 2));
    }
  };

  // Preview winner
  let setsA = 0, setsB = 0;
  for (const s of sets) {
    if (s.scoreA > s.scoreB) setsA++;
    else if (s.scoreB > s.scoreA) setsB++;
  }
  const previewWinner = setsA > setsB ? "A" : setsB > setsA ? "B" : null;

  const handleSubmit = async () => {
    if (!previewWinner) {
      toast.error("Defina um vencedor (adicione tiebreak se necessário)");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitMatchScore(
        matchId,
        seasonId,
        sets.map((s, i) => ({ setNumber: i + 1, scoreA: s.scoreA, scoreB: s.scoreB }))
      );
      toast.success(`Partida finalizada! Time ${result.winnerTeam} venceu ${result.setsA}-${result.setsB}`);
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar placar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-border bg-card p-6 pb-10 sm:pb-6 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold text-foreground">
            Partida {matchNumber}
          </h2>
          <button onClick={onClose} className="rounded-full bg-muted p-2">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Teams header */}
        <div className="mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
          <div className="flex-1 text-primary">
            Time A
            <div className="mt-1 flex flex-wrap gap-1">
              {teamA.map((p, i) => (
                <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {p.name}
                </span>
              ))}
            </div>
          </div>
          <div className="px-3 text-muted-foreground">vs</div>
          <div className="flex-1 text-right text-info">
            Time B
            <div className="mt-1 flex flex-wrap justify-end gap-1">
              {teamB.map((p, i) => (
                <span key={i} className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info">
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Sets */}
        <div className="space-y-3">
          {sets.map((set, idx) => (
            <div key={idx} className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
              <span className="w-12 text-xs font-medium text-muted-foreground">
                {idx < 2 ? `Set ${idx + 1}` : "Tiebreak"}
              </span>
              <div className="flex flex-1 items-center justify-center gap-2">
                <button
                  onClick={() => updateScore(idx, "A", set.scoreA - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-95"
                >
                  −
                </button>
                <span className="w-8 text-center font-display text-xl font-bold text-primary">
                  {set.scoreA}
                </span>
                <button
                  onClick={() => updateScore(idx, "A", set.scoreA + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-95"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-muted-foreground">×</span>
              <div className="flex flex-1 items-center justify-center gap-2">
                <button
                  onClick={() => updateScore(idx, "B", set.scoreB - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-95"
                >
                  −
                </button>
                <span className="w-8 text-center font-display text-xl font-bold text-info">
                  {set.scoreB}
                </span>
                <button
                  onClick={() => updateScore(idx, "B", set.scoreB + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground active:scale-95"
                >
                  +
                </button>
              </div>
              {idx === 2 && (
                <button onClick={removeTiebreak} className="text-xs text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add tiebreak */}
        {sets.length < 3 && setsA === setsB && setsA > 0 && (
          <button
            onClick={addTiebreak}
            className="mt-3 w-full rounded-2xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground"
          >
            + Adicionar Tiebreak (3º set)
          </button>
        )}

        {/* Preview */}
        {previewWinner && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-success/10 py-2.5">
            <Trophy className="h-4 w-4 text-success" />
            <span className="text-sm font-semibold text-success">
              Time {previewWinner} vence {setsA}-{setsB}
            </span>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!previewWinner || submitting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {submitting ? "Salvando..." : "Salvar Placar e Calcular Elo"}
        </button>
      </div>
    </div>
  );
}
