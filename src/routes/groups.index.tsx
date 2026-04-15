import { createFileRoute, Link } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/hooks/use-auth";
import { useMyGroups, usePublicGroups } from "@/hooks/use-groups";
import { CreateGroupDialog } from "@/components/CreateGroupDialog";
import { Plus, Search, Users, Lock, Globe } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/groups/")({
  component: GroupsIndexPage,
});

function GroupsIndexPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<"my" | "explore">("my");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { groups: myGroups, isLoading: myLoading, refresh } = useMyGroups();
  const { groups: publicGroups, isLoading: pubLoading } = usePublicGroups(tab === "explore" ? search : "");

  if (authLoading) {
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

  const groups = tab === "my" ? myGroups : publicGroups;
  const loading = tab === "my" ? myLoading : pubLoading;

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="px-5 pb-4 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl font-bold text-foreground">Grupos</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Criar
          </button>
        </div>
        {tab === "explore" && (
          <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar grupos públicos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        )}
      </header>

      <div className="space-y-5 px-5">
        <div className="flex gap-1 rounded-full border border-border bg-card p-1">
          <button
            onClick={() => setTab("my")}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
              tab === "my" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Meus Grupos
          </button>
          <button
            onClick={() => setTab("explore")}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
              tab === "explore" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Explorar
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-display text-base font-bold text-foreground">
                {tab === "my" ? "Nenhum grupo ainda" : "Nenhum grupo encontrado"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {tab === "my"
                  ? "Crie um grupo ou explore grupos públicos."
                  : "Tente outra busca ou crie o seu grupo."}
              </p>
              {tab === "my" && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-2 flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  <Plus className="h-4 w-4" />
                  Criar grupo
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <Link
                key={group.id}
                to="/groups/$groupId"
                params={{ groupId: group.id }}
                className="flex items-center justify-between rounded-2xl border border-border bg-card/50 p-4 transition-colors active:bg-accent/30"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">{group.name}</span>
                      {group.is_public ? (
                        <Globe className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {group.member_count} membro{group.member_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <CreateGroupDialog
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          refresh();
        }}
      />
      <BottomNav />
    </div>
  );
}