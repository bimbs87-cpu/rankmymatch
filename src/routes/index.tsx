import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useMyGroups } from "@/hooks/use-groups";
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
  Globe,
  Lock,
} from "lucide-react";

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
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary">
          <Trophy className="h-10 w-10 text-primary-foreground" />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          RankMyMatch
        </h1>
        <p className="mt-3 mb-8 text-center text-sm text-muted-foreground">
          O app definitivo para feirinos com rankings,
          temporadas de padel entre amigos e clubes.
        </p>
        <Link to="/login">
          <button className="rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]">
            Começar agora
          </button>
        </Link>
      </div>
    );
  }

  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || "Jogador";
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <header className="px-5 pb-2 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-11 w-11 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground font-display font-bold">
                {displayName.charAt(0)}
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Ranking Pro</p>
              <p className="font-display text-base font-bold text-foreground">{displayName}</p>
            </div>
          </div>
          <Link to="/notifications" className="relative rounded-full border border-border bg-card p-2.5 transition-colors hover:bg-accent">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
          </Link>
        </div>
      </header>

      <div className="space-y-6 px-5 pt-6">
        {/* Quick Actions */}
        <section className="grid grid-cols-2 gap-3">
          <button className="flex flex-col items-center justify-center gap-1.5 rounded-3xl bg-primary p-5 text-primary-foreground transition-transform active:scale-[0.97]">
            <Plus className="h-7 w-7" strokeWidth={2.5} />
            <span className="text-sm font-semibold">Nova Partida</span>
          </button>
          <Link to="/ranking" className="flex flex-col items-center justify-center gap-1.5 rounded-3xl border border-border bg-card p-5 text-foreground transition-transform active:scale-[0.97]">
            <span className="font-display text-3xl font-bold text-primary">—</span>
            <span className="text-sm font-semibold text-muted-foreground">Seu Ranking</span>
          </Link>
        </section>

        {/* Próxima Partida */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Próxima Partida
            </h2>
            <Link to="/seasons" className="flex items-center gap-0.5 text-xs font-medium text-primary">
              Ver todos <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <Calendar className="h-7 w-7 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma rodada agendada</p>
              <p className="text-xs text-muted-foreground/60">Crie ou entre em um grupo para começar</p>
            </div>
          </div>
        </section>

        {/* Meus Grupos */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Seus Grupos
            </h2>
            <Link to="/groups" className="flex items-center gap-0.5 text-xs font-medium text-primary">
              Explorar <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <Users className="h-7 w-7 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum grupo ainda</p>
              <Link to="/groups">
                <button className="mt-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent">
                  Buscar grupos
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* Ranking */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ranking
            </h2>
            <Link to="/ranking" className="flex items-center gap-0.5 text-xs font-medium text-primary">
              Completo <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <BarChart3 className="h-7 w-7 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Entre em uma temporada para ver o ranking</p>
            </div>
          </div>
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
