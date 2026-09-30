import { Crown } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { EligibilityNotice, EligibilityProgress } from "@/components/EligibilityNotice";

export interface RankingShareEntry {
  user_id: string;
  name: string;
  avatar_url: string | null;
  rating: number;
  position: number | null;
  positionChange?: number;
  lastChange?: number;
  matches_played: number;
  matches_won: number;
  sets_played: number;
  is_eligible: boolean;
  isFormerMember?: boolean;
  last_5_results: string[];
}

export function RankingShareImage({ groupName, seasonName, date, completedRounds, totalSets, remainingRounds, minimumSets, eligibilityPct, entries }: {
  groupName: string;
  seasonName: string;
  date: string;
  completedRounds: number;
  totalSets: number;
  remainingRounds: number;
  minimumSets: number;
  eligibilityPct: number;
  entries: RankingShareEntry[];
}) {
  const eligible = entries.filter((entry) => entry.is_eligible);
  const podium = eligible.slice(0, 3);
  const ordered = podium.length >= 3 ? [podium[1], podium[0], podium[2]] : [];
  return (
    <div className="w-[441px] bg-background p-2 text-foreground">
      <div className="mb-2 rounded-2xl border border-border bg-card px-4 py-3">
        <p className="truncate font-display text-base font-bold">{groupName}</p>
        <p className="text-[11px] text-muted-foreground">{seasonName} · {date}</p>
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-2 text-center">
          <div><b className="block text-sm text-primary">{completedRounds}</b><span className="text-[10px] text-muted-foreground">rodadas realizadas</span></div>
          <div><b className="block text-sm text-primary">{totalSets}</b><span className="text-[10px] text-muted-foreground">sets realizados</span></div>
          <div><b className="block text-sm text-primary">{remainingRounds}</b><span className="text-[10px] text-muted-foreground">rodadas restantes</span></div>
        </div>
      </div>
      {ordered.length === 3 && (
        <div className="mb-2 flex h-[240px] items-end justify-center gap-2 rounded-2xl border border-border bg-card px-3 pb-2">
          {ordered.map((entry, index) => {
            const place = index === 0 ? 2 : index === 1 ? 1 : 3;
            return (
              <div key={entry.user_id} className="flex w-[94px] flex-col items-center text-center">
                {place === 1 && <Crown className="mb-1 h-5 w-5 text-rank-gold" fill="currentColor" />}
                <PlayerAvatar avatarUrl={entry.avatar_url} name={entry.name} size="lg" className="!h-11 !w-11 border-2 border-primary/30" />
                <span className="mt-1 w-full truncate text-[11px] font-semibold">{entry.name}</span>
                <b className="text-sm text-primary">{Math.round(entry.rating).toLocaleString("pt-BR")}</b>
                <span className="text-[9px] text-muted-foreground">{entry.matches_played ? Math.round(entry.matches_won / entry.matches_played * 100) : 0}% WR</span>
                <div className={`mt-1 flex w-full items-center justify-center rounded-t-lg border-t-2 ${place === 1 ? "h-24 border-rank-gold bg-rank-gold/20 text-rank-gold" : place === 2 ? "h-16 border-rank-silver bg-rank-silver/20 text-rank-silver" : "h-12 border-rank-bronze bg-rank-bronze/20 text-rank-bronze"}`}><b className="text-lg">{place}º</b></div>
              </div>
            );
          })}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center border-b border-border bg-muted/30 px-2 py-2 text-[9px] font-bold uppercase text-muted-foreground">
          <span className="w-8 text-center">#</span><span className="flex-1 pl-1">Jogador</span><span className="w-11 text-center">Elo</span><span className="w-[72px] text-center">V/D (WR%)</span><span className="w-16 text-center">Últimas</span>
        </div>
        {entries.map((entry, index) => {
          const wr = entry.matches_played ? Math.round(entry.matches_won / entry.matches_played * 100) : 0;
          return (
            <div key={entry.user_id}>
              {index === eligible.length && index < entries.length && (
                <div className="border-t border-border/60 px-3 py-3">
                  <p className="text-xs font-semibold">Inativos</p>
                  <EligibilityNotice minimum={minimumSets} totalSets={totalSets} percentage={eligibilityPct} className="mt-1" />
                </div>
              )}
              <div className={`flex h-[44px] items-center border-t border-border/40 px-2 text-[11px] ${!entry.is_eligible ? "opacity-60" : index % 2 === 0 ? "bg-muted/10" : ""}`}>
                <span className="w-8 shrink-0 text-center font-bold">{entry.position ?? "—"}</span>
                <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
                  <PlayerAvatar avatarUrl={entry.avatar_url} name={entry.name} size="sm" className="!h-7 !w-7 border border-border" />
                  <div className="min-w-0"><p className="truncate font-semibold">{entry.name}</p>{!entry.is_eligible && <p className="text-[9px] text-muted-foreground"><EligibilityProgress played={entry.sets_played} totalSets={totalSets} /></p>}</div>
                </div>
                <div className="w-11 text-center"><b>{Math.round(entry.rating)}</b>{entry.lastChange !== undefined && <p className={`text-[8px] ${entry.lastChange < 0 ? "text-destructive" : "text-success"}`}>{entry.lastChange > 0 ? "+" : ""}{Math.round(entry.lastChange)}</p>}</div>
                <span className="w-[72px] text-center">{entry.matches_won}/{entry.matches_played - entry.matches_won} <span className={wr < 40 ? "text-destructive" : "text-success"}>({wr}%)</span></span>
                <span className="flex w-16 justify-center gap-0.5">{entry.last_5_results.length ? entry.last_5_results.slice(0, 5).map((result, i) => <i key={i} className={`h-2.5 w-2.5 rounded-full ${result === "W" ? "bg-success" : result === "L" ? "bg-destructive" : "bg-muted"}`} />) : <span className="text-muted-foreground">—</span>}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}