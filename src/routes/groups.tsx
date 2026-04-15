import { createFileRoute, Link } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
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
        <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-lg font-semibold text-foreground">Faça login para ver grupos</h2>
        <Link to="/login" className="mt-4">
          <Button className="rounded-2xl">Entrar</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-foreground">Grupos</h1>
          <Button size="sm" className="gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" />
            Criar
          </Button>
        </div>
        {/* Search */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-accent/50 px-3 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar grupos públicos..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
      </header>

      <div className="space-y-5 px-4 pt-5">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-accent/50 p-1">
          <button className="flex-1 rounded-lg bg-card py-2 text-xs font-semibold text-foreground shadow-sm">
            Meus Grupos
          </button>
          <button className="flex-1 rounded-lg py-2 text-xs font-medium text-muted-foreground">
            Explorar
          </button>
        </div>

        {/* Empty state */}
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              Crie seu primeiro grupo
            </h3>
            <p className="text-sm text-muted-foreground">
              Reúna seus amigos e organize temporadas de padel com ranking automático.
            </p>
            <Button className="mt-2 gap-2 rounded-2xl">
              <Plus className="h-4 w-4" />
              Criar grupo
            </Button>
          </div>
        </div>

        {/* Example cards for visual reference */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Grupos populares
          </h3>
          {[
            { name: "Padel São Paulo", members: 12, isPublic: true },
            { name: "Feirinos do Rio", members: 8, isPublic: true },
            { name: "Club Padel SP", members: 16, isPublic: false },
          ].map((group) => (
            <div
              key={group.name}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-all hover:border-primary/20 hover:shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sport/10">
                <Users className="h-6 w-6 text-sport" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground">
                    {group.name}
                  </span>
                  {group.isPublic ? (
                    <Globe className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {group.members} jogadores
                </p>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl text-xs">
                Entrar
              </Button>
            </div>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
