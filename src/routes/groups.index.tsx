import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useMyGroups, useMyPendingJoinRequests, usePublicGroups } from "@/hooks/use-groups";
import { CreateGroupDialog } from "@/components/CreateGroupDialog";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { Plus, Search, Users, Lock, Globe, Trophy, CalendarDays, Sparkles, Clock, Link2, Shield } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/groups/")({
  component: GroupsIndexPage,
});

function GroupsIndexPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [authLoading, isAuthenticated, navigate]);
  const [tab, setTab] = useState<"my" | "explore">("my");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { groups: myGroups, isLoading: myLoading, refresh } = useMyGroups();
  const { groups: pendingGroups, isLoading: pendingLoading, refresh: refreshPending } = useMyPendingJoinRequests();
  const { groups: publicGroups, isLoading: pubLoading } = usePublicGroups(tab === "explore" ? search : "");

  if (authLoading) {
    return <TrophyLoadingBar />;
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
    <div className="min-h-screen bg-background pb-32">
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

        {tab === "explore" && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3">
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

        {tab === "my" && !myLoading && pendingGroups.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 px-1">
              <Clock className="h-3 w-3 text-warning" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Aguardando aprovação
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pendingGroups.map((group) => (
                <div
                  key={group.id}
                  className="relative flex flex-col overflow-hidden rounded-2xl border border-warning/30 bg-card opacity-90"
                >
                  <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">
                    <Clock className="h-2.5 w-2.5" />
                    Pendente
                  </div>
                  <div className="flex items-start gap-3 p-4">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-warning/10 ring-1 ring-warning/20">
                      <Users className="h-5 w-5 text-warning" />
                    </div>
                    <div className="min-w-0 flex-1 pr-16">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-foreground">{group.name}</span>
                        {group.is_public ? (
                          <Globe className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <Lock className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {group.member_count} membro{group.member_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="px-4 pb-3">
                    {group.claimed_player_name ? (
                      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <Link2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary" />
                        <span>
                          {(group as { pending_kind?: "join_request" | "claim" }).pending_kind === "claim"
                            ? "Vinculação pendente como "
                            : "Vinculação solicitada como "}
                          <span className="font-semibold text-foreground">{group.claimed_player_name}</span>
                        </span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Aguarde o admin aprovar sua entrada.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <TrophyLoadingBar fullScreen={false} compact />
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
          <div className={tab === "my" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
            {groups.map((group) => {
              const isMyTab = tab === "my";
              const stats = group as typeof group & {
                rounds_done?: number;
                rounds_total?: number;
                seasons_done?: number;
                current_season_name?: string | null;
                my_role?: string | null;
              };
              const roundsDone = stats.rounds_done ?? 0;
              const roundsTotal = stats.rounds_total ?? 0;
              const roundsRemaining = Math.max(0, roundsTotal - roundsDone);
              const seasonsDone = stats.seasons_done ?? 0;
              const currentSeason = stats.current_season_name ?? null;
              const isAdmin = stats.my_role === "admin" || stats.my_role === "creator";
              const isCreator = stats.my_role === "creator";

              return (
                <Link
                  key={group.id}
                  to="/groups/$groupId"
                  params={{ groupId: group.id }}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-lg active:scale-[0.99]"
                >
                  {isMyTab && isAdmin && (
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary ring-1 ring-primary/30">
                      <Shield className="h-2.5 w-2.5" />
                      {isCreator ? "Criador" : "Admin"}
                    </div>
                  )}
                  {/* Top — identity */}
                  <div className="flex items-start gap-3 p-4">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div className={`min-w-0 flex-1 ${isMyTab && isAdmin ? "pr-16" : ""}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-foreground">{group.name}</span>
                        {group.is_public ? (
                          <Globe className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <Lock className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {group.member_count} membro{group.member_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  {isMyTab && (
                    <>
                      {/* Stats grid — 3 square mini-cards */}
                      <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
                        <StatTile
                          icon={<CalendarDays className="h-3 w-3" />}
                          label="Rodadas"
                          primary={String(roundsDone)}
                          secondary={
                            roundsTotal > 0
                              ? `${roundsRemaining} restante${roundsRemaining === 1 ? "" : "s"}`
                              : "—"
                          }
                        />
                        <StatTile
                          icon={<Trophy className="h-3 w-3" />}
                          label="Temporadas"
                          primary={String(seasonsDone)}
                          secondary={seasonsDone === 1 ? "concluída" : "concluídas"}
                        />
                        <StatTile
                          icon={<Sparkles className="h-3 w-3" />}
                          label="Atual"
                          primary={currentSeason ? "•" : "—"}
                          secondary={currentSeason || "Nenhuma"}
                          truncate
                          highlight={!!currentSeason}
                        />
                      </div>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <CreateGroupDialog
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          refresh();
          refreshPending();
        }}
      />
    </div>
  );
}

interface StatTileProps {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
  truncate?: boolean;
  highlight?: boolean;
}

function StatTile({ icon, label, primary, secondary, truncate, highlight }: StatTileProps) {
  return (
    <div
      className={`aspect-square flex flex-col justify-between rounded-xl border p-2 ${
        highlight
          ? "border-primary/30 bg-primary/5"
          : "border-border/60 bg-muted/30"
      }`}
    >
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        <span className={highlight ? "text-primary" : ""}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="flex flex-col leading-tight">
        <span
          className={`font-display text-lg font-bold tabular-nums ${
            highlight ? "text-primary" : "text-foreground"
          }`}
        >
          {primary}
        </span>
        <span
          className={`text-[9px] text-muted-foreground ${truncate ? "truncate" : ""}`}
          title={secondary}
        >
          {secondary}
        </span>
      </div>
    </div>
  );
}