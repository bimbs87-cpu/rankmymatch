import { createFileRoute, Link } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Search, Users, Lock, Globe } from "lucide-react";

export const Route = createFileRoute("/groups")({
  component: GroupsPage,
});

function GroupsPage() {
  const { isAuthenticated, isLoading } = useAuth();

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
        <Users className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="font-display text-lg font-bold text-foreground">Faça login para ver grupos</h2>
        <Link to="/login" className="mt-4">
          <button className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">Entrar</button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <header className="px-5 pb-4 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl font-bold text-foreground">Grupos</h1>
          <button className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-3.5 w-3.5" />
            Criar
          </button>
        </div>
        {/* Search */}
        <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar grupos públicos..."
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </header>

      <div className="space-y-5 px-5">
        {/* Tabs */}
        <div className="flex gap-1 rounded-full bg-card border border-border p-1">
          <button className="flex-1 rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground">
            Meus Grupos
          </button>
          <button className="flex-1 rounded-full py-2 text-xs font-medium text-muted-foreground">
            Explorar
          </button>
        </div>

        {/* Empty state */}
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-display text-base font-bold text-foreground">
              Crie seu primeiro grupo
            </h3>
            <p className="text-sm text-muted-foreground">
              Reúna seus amigos e organize temporadas de padel com ranking automático.
            </p>
            <button className="mt-2 flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" />
              Criar grupo
            </button>
          </div>
        </div>

        {/* Example cards */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Grupos populares
          </h3>
          {[
            { name: "Elite Padel Club", members: 12, isPublic: true },
            { name: "Torneio Sábado", members: 8, isPublic: true },
            { name: "Club Privado SP", members: 16, isPublic: false },
          ].map((group) => (
            <div
              key={group.name}
              className="flex items-center justify-between rounded-2xl border border-border bg-card/50 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">{group.name}</span>
                    {group.isPublic ? (
                      <Globe className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{group.members} membros ativos</p>
                </div>
              </div>
              <span className="text-sm font-bold text-primary">+{Math.floor(Math.random() * 5) + 1}</span>
            </div>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
