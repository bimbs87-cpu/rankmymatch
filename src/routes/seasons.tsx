import { createFileRoute, Link } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Calendar, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/seasons")({
  component: SeasonsPage,
});

function SeasonsPage() {
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
          <h1 className="text-lg font-bold text-foreground">Temporadas</h1>
        </div>
      </header>

      <div className="space-y-5 px-4 pt-5">
        {!isAuthenticated ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Faça login para ver temporadas</p>
            <Link to="/login" className="mt-3 inline-block">
              <Button size="sm" className="rounded-2xl">Entrar</Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rank-gold/10">
                <Trophy className="h-7 w-7 text-rank-gold" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Nenhuma temporada ativa
              </h3>
              <p className="text-sm text-muted-foreground">
                Entre em um grupo e inicie uma temporada para competir no ranking.
              </p>
              <Link to="/groups">
                <Button variant="outline" size="sm" className="mt-2 rounded-xl">
                  Explorar grupos
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
