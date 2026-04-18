import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMyGroups, useMyPendingJoinRequests } from "@/hooks/use-groups";
import { useGroupAlerts } from "@/hooks/use-group-alerts";
import { CreateGroupDialog } from "@/components/CreateGroupDialog";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { GroupSidebar } from "@/components/groups/GroupSidebar";
import { GroupDashboardPanel } from "@/components/groups/GroupDashboardPanel";
import { ExplorePanel } from "@/components/groups/ExplorePanel";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Plus, Compass, Users } from "lucide-react";

export const Route = createFileRoute("/groups/")({
  component: GroupsIndexPage,
});

function GroupsIndexPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate({ to: "/login" });
  }, [authLoading, isAuthenticated, navigate]);

  const { groups: myGroups, isLoading: myLoading, refresh } = useMyGroups();
  const { groups: pendingGroups, refresh: refreshPending } = useMyPendingJoinRequests();

  const [view, setView] = useState<"group" | "explore">("group");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Auto-select first group when loaded
  useEffect(() => {
    if (!selectedId && myGroups.length > 0 && view === "group") {
      setSelectedId(myGroups[0].id);
    }
    if (selectedId && !myGroups.find((g) => g.id === selectedId)) {
      setSelectedId(myGroups[0]?.id ?? null);
    }
  }, [myGroups, selectedId, view]);

  // If user has no groups and isn't loading, default to explore
  useEffect(() => {
    if (!myLoading && myGroups.length === 0 && view === "group") {
      setView("explore");
    }
  }, [myLoading, myGroups.length, view]);

  const sidebarGroups = useMemo(
    () =>
      myGroups.map((g) => ({
        id: g.id,
        name: g.name,
        image_url: g.image_url,
        is_public: g.is_public,
        member_count: g.member_count,
        my_role: g.my_role,
        current_season_name: g.current_season_name,
      })),
    [myGroups],
  );

  const sidebarPending = useMemo(
    () => pendingGroups.map((p) => ({ id: p.id, name: p.name })),
    [pendingGroups],
  );

  const allGroupIds = useMemo(() => myGroups.map((g) => g.id), [myGroups]);
  const adminGroupIds = useMemo(
    () => myGroups.filter((g) => g.my_role === "admin" || g.my_role === "creator").map((g) => g.id),
    [myGroups],
  );
  const { alerts, refresh: refreshAlerts } = useGroupAlerts(allGroupIds, adminGroupIds);

  if (authLoading) return <TrophyLoadingBar />;

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <Users className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="font-display text-lg font-bold text-foreground">Faça login para ver grupos</h2>
        <Link to="/login" className="mt-4">
          <button className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">
            Entrar
          </button>
        </Link>
      </div>
    );
  }

  const selectedGroup = myGroups.find((g) => g.id === selectedId) || null;

  const handleSelectGroup = (id: string) => {
    setSelectedId(id);
    setView("group");
    setMobileNavOpen(false);
  };

  const handleSelectExplore = () => {
    setView("explore");
    setMobileNavOpen(false);
  };

  const sidebar = (
    <GroupSidebar
      groups={sidebarGroups}
      pendingGroups={sidebarPending}
      selectedId={selectedId}
      onSelect={handleSelectGroup}
      onSelectExplore={handleSelectExplore}
      onCreate={() => {
        setShowCreate(true);
        setMobileNavOpen(false);
      }}
      view={view}
      isLoading={myLoading}
      alerts={alerts}
    />
  );

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Mobile header */}
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-5 lg:hidden">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <button className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground">
              <Menu className="h-4 w-4" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0">
            {sidebar}
          </SheetContent>
        </Sheet>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-base font-bold text-foreground">
            {view === "explore" ? "Explorar grupos" : selectedGroup?.name || "Grupos"}
          </h1>
          <p className="text-[10px] text-muted-foreground">
            {view === "explore" ? "Descubra grupos públicos" : `${myGroups.length} grupo${myGroups.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground"
        >
          <Plus className="h-3 w-3" />
          Criar
        </button>
      </header>

      {/* Layout */}
      <div className="lg:flex lg:gap-0">
        {/* Desktop sidebar */}
        <div className="sticky top-0 hidden h-screen w-[280px] flex-shrink-0 border-r border-border bg-card/30 lg:block">
          <div className="flex h-full flex-col pt-5">
            <div className="px-5 pb-3">
              <h1 className="font-display text-2xl font-bold text-foreground">Grupos</h1>
              <p className="text-[11px] text-muted-foreground">Comunidades de padel</p>
            </div>
            <div className="flex-1 overflow-hidden">{sidebar}</div>
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 px-4 pt-2 sm:px-6 lg:px-8 lg:pt-8">
          {view === "explore" ? (
            <ExplorePanel />
          ) : selectedGroup ? (
            <GroupDashboardPanel group={selectedGroup} />
          ) : (
            <EmptyState onCreate={() => setShowCreate(true)} onExplore={() => setView("explore")} />
          )}
        </main>
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

function EmptyState({ onCreate, onExplore }: { onCreate: () => void; onExplore: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Users className="h-8 w-8 text-primary" />
      </div>
      <h3 className="font-display text-lg font-bold text-foreground">Nenhum grupo ainda</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Crie seu próprio grupo para começar a organizar rodadas, ou descubra grupos públicos da comunidade.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          onClick={onCreate}
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          Criar grupo
        </button>
        <button
          onClick={onExplore}
          className="flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-foreground hover:border-primary/40"
        >
          <Compass className="h-4 w-4" />
          Explorar
        </button>
      </div>
    </div>
  );
}
