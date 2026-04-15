import { createFileRoute, Link } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/hooks/use-auth";
import { Trophy } from "lucide-react";

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
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rank-gold/10">
                <Trophy className="h-7 w-7 text-rank-gold" />
              </div>
              <h3 className="font-display text-base font-bold text-foreground">
                Nenhuma temporada ativa
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
        )}
      </div>

      <BottomNav />
    </div>
  );
}
