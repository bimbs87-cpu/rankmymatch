import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Swords, ChevronRight, Edit3 } from "lucide-react";
import { ScoreEntryDialog } from "@/components/ScoreEntryDialog";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import type { PendingMatch } from "@/hooks/use-pending-matches";

interface Props {
  match: PendingMatch;
  onScoreSaved: () => void;
  showGroupName?: boolean;
  isAdmin?: boolean;
}

export function PendingMatchCard({ match, onScoreSaved, showGroupName = true, isAdmin = false }: Props) {
  const [scoring, setScoring] = useState(false);
  const isSingles = match.group_match_format === "singles";

  const playerAName = match.teamA[0]?.nickname || match.teamA[0]?.name || "Jogador A";
  const playerBName = match.teamB[0]?.nickname || match.teamB[0]?.name || "Jogador B";

  return (
    <>
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 animate-in fade-in duration-300">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
              <Swords className="h-3 w-3 text-primary" />
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                Próximo {isSingles ? "confronto" : "jogo"}
              </span>
              {showGroupName && (
                <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{match.group_name}</p>
              )}
            </div>
          </div>
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
            Aguardando resultado
          </span>
        </div>

        {/* Players */}
        <div className="flex items-center gap-3 mb-3">
          {/* Side A */}
          <div className="flex flex-1 items-center gap-2">
            <PlayerAvatar avatarUrl={match.teamA[0]?.avatar_url || null} name={playerAName} size="sm" className="ring-1 ring-primary/30 !h-7 !w-7" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{playerAName}</p>
              {!isSingles && match.teamA.length > 1 && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {match.teamA.slice(1).map((p) => p.nickname || p.name).join(", ")}
                </p>
              )}
            </div>
          </div>

          <span className="text-[10px] font-bold text-muted-foreground">VS</span>

          {/* Side B */}
          <div className="flex flex-1 items-center justify-end gap-2">
            <div className="min-w-0 text-right">
              <p className="text-xs font-semibold text-foreground truncate">{playerBName}</p>
              {!isSingles && match.teamB.length > 1 && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {match.teamB.slice(1).map((p) => p.nickname || p.name).join(", ")}
                </p>
              )}
            </div>
            <PlayerAvatar avatarUrl={match.teamB[0]?.avatar_url || null} name={playerBName} size="sm" className="ring-1 ring-info/30 !h-7 !w-7" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => setScoring(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground active:scale-[0.98]"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Lançar resultado
            </button>
          )}
          <Link
            to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
            params={{
              groupId: match.group_id,
              seasonId: match.season_id,
              roundId: match.round_id,
            }}
            className={`flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs font-semibold text-muted-foreground active:bg-accent/30 ${isAdmin ? "px-4" : "flex-1"}`}
          >
            Ver rodada
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {scoring && (
        <ScoreEntryDialog
          matchId={match.id}
          seasonId={match.season_id}
          matchNumber={match.match_number || 1}
          teamA={match.teamA.map((p) => ({ name: p.nickname || p.name, avatarUrl: p.avatar_url || undefined, userId: (p as any).user_id }))}
          teamB={match.teamB.map((p) => ({ name: p.nickname || p.name, avatarUrl: p.avatar_url || undefined, userId: (p as any).user_id }))}
          existingSets={match.existingSets}
          setsPerMatch={match.sets_per_match}
          isSingles={match.group_match_format === "singles"}
          onClose={() => setScoring(false)}
          onSaved={() => { setScoring(false); onScoreSaved(); }}
        />
      )}
    </>
  );
}
