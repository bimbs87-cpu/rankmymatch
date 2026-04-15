import { createFileRoute, Link } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/hooks/use-auth";
import { BarChart3, Info, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ranking")({
  component: RankingPage,
});

function RankingPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-foreground">Ranking</h1>
          <Link to="/ranking-info" className="rounded-xl p-2 hover:bg-accent">
            <Info className="h-5 w-5 text-muted-foreground" />
          </Link>
        </div>
      </header>

      <div className="space-y-5 px-4 pt-5">
        {!isAuthenticated ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <BarChart3 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Faça login para ver rankings</p>
            <Link to="/login" className="mt-3 inline-block">
              <Button size="sm" className="rounded-2xl">Entrar</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Ranking explanation card */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Trophy className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Sistema Elo de Ranking
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Vencer adversários mais fortes vale mais pontos. Todos começam com 1000 Elo.
                  </p>
                  <Link to="/ranking-info" className="mt-2 inline-block text-xs font-medium text-primary">
                    Como funciona →
                  </Link>
                </div>
              </div>
            </div>

            {/* Empty state */}
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8">
              <div className="flex flex-col items-center gap-3 text-center">
                <BarChart3 className="h-10 w-10 text-muted-foreground/40" />
                <h3 className="text-base font-semibold text-foreground">
                  Nenhum ranking disponível
                </h3>
                <p className="text-sm text-muted-foreground">
                  Participe de uma temporada para aparecer no ranking.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
