import { createFileRoute, Link } from "@tanstack/react-router";
import { LoadingBar } from "@/components/LoadingBar";
import { useAuth } from "@/hooks/use-auth";
import { useMyGroups } from "@/hooks/use-groups";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { Trophy, Calendar, ChevronRight, Users } from "lucide-react";

export const Route = createFileRoute("/seasons")({
  component: SeasonsPage,
});

interface SeasonItem {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  total_rounds: number | null;
  group_id: string;
  group_name: string;
}

function SeasonsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { groups, isLoading: groupsLoading } = useMyGroups();
  const [seasons, setSeasons] = useState<SeasonItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !groups.length) {
      setLoading(false);
      return;
    }

    const groupIds = groups.map((g) => g.id);

    supabase
      .from("seasons")
      .select("*, groups(name)")
      .in("group_id", groupIds)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) {
          setSeasons(
            data.map((s: any) => ({
              id: s.id,
              name: s.name,
              status: s.status,
              start_date: s.start_date,
              end_date: s.end_date,
              total_rounds: s.total_rounds,
              group_id: s.group_id,
              group_name: s.groups?.name || "Grupo",
            }))
          );
        }
        setLoading(false);
      });
  }, [user, groups]);

  if (isLoading || groupsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const formatDate = (d: string | null) => {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "active": return "Ativa";
      case "finished": return "Encerrada";
      case "draft": return "Rascunho";
      default: return s;
    }
  };

  const statusClass = (s: string) => {
    switch (s) {
      case "active": return "bg-success/10 text-success";
      case "finished": return "bg-muted text-muted-foreground";
      case "draft": return "bg-info/10 text-info";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="px-5 pt-6 pb-2">
        <h1 className="font-display text-xl font-bold text-foreground">Temporadas</h1>
      </header>

      <div className="px-5 pt-4">
        {!isAuthenticated ? (
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <Trophy className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Faça login para ver temporadas</p>
            <Link to="/login" className="mt-3 inline-block">
              <button className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground">Entrar</button>
            </Link>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-4 animate-pulse">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="mt-2 h-3 w-48 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : seasons.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rank-gold/10">
                <Trophy className="h-7 w-7 text-rank-gold" />
              </div>
              <h3 className="font-display text-base font-bold text-foreground">
                Nenhuma temporada encontrada
              </h3>
              <p className="text-sm text-muted-foreground">
                Entre em um grupo e inicie uma temporada para competir no ranking.
              </p>
              <Link to="/groups">
                <button className="mt-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground">
                  Explorar grupos
                </button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {seasons.map((s) => (
              <Link
                key={s.id}
                to="/groups/$groupId/seasons/$seasonId"
                params={{ groupId: s.group_id, seasonId: s.id }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors active:bg-accent/30"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Trophy className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusClass(s.status)}`}>
                      {statusLabel(s.status)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {s.group_name}
                    </span>
                    {s.start_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(s.start_date)}
                        {s.end_date ? ` – ${formatDate(s.end_date)}` : ""}
                      </span>
                    )}
                    {s.total_rounds && (
                      <span>{s.total_rounds} rodadas</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
