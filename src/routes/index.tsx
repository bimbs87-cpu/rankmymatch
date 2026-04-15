import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/BottomNav";
import {
  Trophy,
  Users,
  Calendar,
  ChevronRight,
  Bell,
  BarChart3,
  Plus,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary shadow-lg shadow-primary/25">
          <Trophy className="h-10 w-10 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          RankMyMatch
        </h1>
        <p className="mt-2 mb-8 text-center text-sm text-muted-foreground">
          O app definitivo para feirinos com rankings,
          temporadas de padel entre amigos e clubes.
        </p>
        <Link to="/login">
          <Button size="lg" className="rounded-2xl px-8 py-6 text-base font-semibold shadow-lg shadow-primary/20">
            Começar agora
          </Button>
        </Link>
      </div>
    );
  }

  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || "Jogador";
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-10 w-10 rounded-full border-2 border-primary/20 object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                {displayName.charAt(0)}
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Bem-vindo de volta</p>
              <p className="text-sm font-semibold text-foreground">{displayName}</p>
            </div>
          </div>
          <Link to="/notifications" className="relative rounded-xl p-2 hover:bg-accent">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
          </Link>
        </div>
      </header>

      <div className="space-y-5 px-4 pt-5">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/groups" className="group">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xs font-medium text-foreground">Criar Grupo</span>
            </div>
          </Link>
          <Link to="/groups" className="group">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 transition-all hover:border-sport/30 hover:shadow-md">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sport/10">
                <Zap className="h-5 w-5 text-sport" />
              </div>
              <span className="text-xs font-medium text-foreground">Lançar Resultado</span>
            </div>
          </Link>
        </div>

        {/* Próximos Jogos - Placeholder */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Próximos Jogos</h2>
            <Link to="/seasons" className="text-xs font-medium text-primary flex items-center gap-0.5">
              Ver todos <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Nenhuma rodada agendada
              </p>
              <p className="text-xs text-muted-foreground/70">
                Crie ou entre em um grupo para começar
              </p>
            </div>
          </div>
        </section>

        {/* Meus Grupos - Placeholder */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Meus Grupos</h2>
            <Link to="/groups" className="text-xs font-medium text-primary flex items-center gap-0.5">
              Explorar <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <Users className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Você ainda não participa de nenhum grupo
              </p>
              <Link to="/groups">
                <Button variant="outline" size="sm" className="mt-2 rounded-xl">
                  Buscar grupos
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Ranking Rápido - Placeholder */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Ranking</h2>
            <Link to="/ranking" className="text-xs font-medium text-primary flex items-center gap-0.5">
              Completo <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Entre em uma temporada para ver o ranking
              </p>
            </div>
          </div>
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
