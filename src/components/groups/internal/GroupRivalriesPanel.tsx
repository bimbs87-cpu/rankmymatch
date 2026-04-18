import { Swords, Heart } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { useGroupH2H } from "@/hooks/use-group-h2h";

interface Props {
  groupId: string;
}

export function GroupRivalriesPanel({ groupId }: Props) {
  const { data, isLoading } = useGroupH2H(groupId);

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-3xl bg-muted/30" />;
  }
  if (!data.rivalries.length && !data.partnerships.length) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {data.rivalries.length > 0 && (
        <div className="rounded-3xl border border-border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Swords className="h-3.5 w-3.5 text-destructive" /> Confrontos clássicos
          </h3>
          <ul className="space-y-2">
            {data.rivalries.map((r, i) => {
              const aLead = r.wins_a > r.wins_b;
              const tied = r.wins_a === r.wins_b;
              return (
                <li
                  key={`${r.user_a}-${r.user_b}`}
                  className="rounded-xl border border-border/50 bg-background/40 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-[10px] font-black text-destructive">
                      {i + 1}
                    </span>
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <PlayerAvatar avatarUrl={r.avatar_a} name={r.name_a} size="xs" />
                        <span className={`truncate text-xs font-semibold ${aLead ? "text-foreground" : "text-muted-foreground"}`}>
                          {r.name_a}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">vs</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <PlayerAvatar avatarUrl={r.avatar_b} name={r.name_b} size="xs" />
                        <span className={`truncate text-xs font-semibold ${!aLead && !tied ? "text-foreground" : "text-muted-foreground"}`}>
                          {r.name_b}
                        </span>
                      </div>
                    </div>
                    <span className="font-display text-xs font-black tabular-nums text-foreground">
                      {r.wins_a}–{r.wins_b}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{r.meetings} {r.meetings === 1 ? "confronto" : "confrontos"}</span>
                    {r.partners > 0 && (
                      <span className="text-info">
                        Já foram dupla {r.partners}x ({r.partners_wins}V)
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {data.partnerships.length > 0 && (
        <div className="rounded-3xl border border-border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Heart className="h-3.5 w-3.5 text-success" /> Duplas mais frequentes
          </h3>
          <ul className="space-y-2">
            {data.partnerships.map((p, i) => {
              const wr = p.partners ? Math.round((p.partners_wins / p.partners) * 100) : 0;
              return (
                <li
                  key={`${p.user_a}-${p.user_b}`}
                  className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 p-2.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-[10px] font-black text-success">
                    {i + 1}
                  </span>
                  <div className="flex -space-x-2">
                    <PlayerAvatar avatarUrl={p.avatar_a} name={p.name_a} size="sm" />
                    <PlayerAvatar avatarUrl={p.avatar_b} name={p.name_b} size="sm" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {p.name_a} & {p.name_b}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.partners_wins}V/{p.partners - p.partners_wins}D em {p.partners} partidas
                    </p>
                  </div>
                  <span className="font-display text-xs font-black text-success tabular-nums">{wr}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
