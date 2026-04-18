import { Link } from "@tanstack/react-router";
import { Trophy, Calendar, Plus, ChevronRight, CircleDot, CheckCircle2 } from "lucide-react";
import { useGroupSeasons } from "@/hooks/use-seasons";

interface Props {
  groupId: string;
  isAdmin: boolean;
  onCreateSeason?: () => void;
}

export function SeasonsPanel({ groupId, isAdmin, onCreateSeason }: Props) {
  const { seasons, isLoading } = useGroupSeasons(groupId);

  const active = seasons.filter((s) => s.status === "active");
  const finished = seasons.filter((s) => s.status !== "active");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Temporadas</h2>
          <p className="text-xs text-muted-foreground">
            {seasons.length} {seasons.length === 1 ? "temporada criada" : "temporadas criadas"}
          </p>
        </div>
        {isAdmin && (
          <Link
            to="/groups/$groupId/seasons"
            params={{ groupId }}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/30" />
          ))}
        </div>
      ) : seasons.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-muted/10 py-12 text-center">
          <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Nenhuma temporada ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAdmin ? "Crie a primeira temporada para começar." : "Aguarde o admin criar uma temporada."}
          </p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-success">
                <CircleDot className="h-3 w-3" /> Em andamento
              </h3>
              <div className="space-y-2">
                {active.map((s) => (
                  <SeasonCard key={s.id} season={s} groupId={groupId} />
                ))}
              </div>
            </section>
          )}

          {finished.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <CheckCircle2 className="h-3 w-3" /> Encerradas
              </h3>
              <div className="space-y-2">
                {finished.map((s) => (
                  <SeasonCard key={s.id} season={s} groupId={groupId} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SeasonCard({ season, groupId }: { season: any; groupId: string }) {
  const isActive = season.status === "active";
  return (
    <Link
      to="/groups/$groupId/seasons/$seasonId"
      params={{ groupId, seasonId: season.id }}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-card/70"
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
          isActive ? "bg-primary/15 text-primary" : "bg-muted/40 text-muted-foreground"
        }`}
      >
        <Trophy className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate font-display text-sm font-bold text-foreground">{season.name}</h4>
          {isActive && (
            <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">
              Ativa
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(season.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })}
          </span>
          <span>·</span>
          <span>{season.match_format === "1v1" ? "Singles" : "Duplas"}</span>
          {season.total_rounds && (
            <>
              <span>·</span>
              <span>{season.total_rounds} rodadas</span>
            </>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
