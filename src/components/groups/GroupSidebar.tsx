import { Users, Compass, Plus, Search, Shield, Globe, Lock, Clock, Filter, Bell } from "lucide-react";
import { useState, useMemo } from "react";

interface GroupSidebarItem {
  id: string;
  name: string;
  image_url: string | null;
  is_public: boolean;
  member_count: number;
  my_role?: string | null;
  current_season_name?: string | null;
}

interface PendingItem {
  id: string;
  name: string;
  status?: "pending" | "approved" | "rejected";
}

export interface GroupAlertInfo {
  pendingPresence: boolean;
  pendingAdminRequests: number;
}

interface Props {
  groups: GroupSidebarItem[];
  pendingGroups: PendingItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectExplore: () => void;
  onCreate: () => void;
  view: "group" | "explore";
  isLoading: boolean;
  alerts?: Record<string, GroupAlertInfo>;
}

export function GroupSidebar({
  groups,
  pendingGroups,
  selectedId,
  onSelect,
  onSelectExplore,
  onCreate,
  view,
  isLoading,
  alerts = {},
}: Props) {
  const [search, setSearch] = useState("");
  const [onlyWithAlerts, setOnlyWithAlerts] = useState(false);

  const totalAlertCount = useMemo(
    () =>
      groups.reduce((acc, g) => {
        const a = alerts[g.id];
        if (!a) return acc;
        return acc + (a.pendingPresence ? 1 : 0) + (a.pendingAdminRequests > 0 ? 1 : 0);
      }, 0),
    [groups, alerts],
  );

  const filtered = useMemo(() => {
    let list = groups;
    if (onlyWithAlerts) {
      list = list.filter((g) => {
        const a = alerts[g.id];
        return a && (a.pendingPresence || a.pendingAdminRequests > 0);
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((g) => g.name.toLowerCase().includes(q));
    }
    return list;
  }, [groups, alerts, onlyWithAlerts, search]);

  return (
    <aside className="flex h-full w-full flex-col bg-card/40 lg:bg-transparent">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Meus grupos
          </h2>
          <button
            onClick={onCreate}
            className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground transition-transform active:scale-95"
            title="Criar grupo"
          >
            <Plus className="h-3 w-3" />
            Novo
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar..."
            className="w-full rounded-full border border-border bg-background/60 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
          />
        </div>

        {/* Explore button — directly below filter */}
        <button
          onClick={onSelectExplore}
          className={`mb-2 flex w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${
            view === "explore"
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border bg-card/60 text-muted-foreground hover:border-primary/30 hover:text-foreground"
          }`}
        >
          <Compass className="h-3.5 w-3.5 text-primary" />
          Explorar grupos
        </button>

        {/* Pending-only toggle */}
        {totalAlertCount > 0 && (
          <button
            onClick={() => setOnlyWithAlerts((v) => !v)}
            className={`flex w-full items-center justify-between gap-2 rounded-full border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
              onlyWithAlerts
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-border bg-background/40 text-muted-foreground hover:border-warning/30 hover:text-warning"
            }`}
            title="Mostrar apenas grupos com pendências"
          >
            <span className="flex items-center gap-1.5">
              <Filter className="h-3 w-3" />
              Apenas com pendências
            </span>
            <span className={`flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
              onlyWithAlerts ? "bg-warning text-warning-foreground" : "bg-warning/20 text-warning"
            }`}>
              {totalAlertCount}
            </span>
          </button>
        )}
      </div>

      {/* Groups list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="space-y-2 px-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/30" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-[11px] text-muted-foreground">
              {search ? "Nada encontrado" : "Você ainda não tem grupos"}
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {filtered.map((g) => {
              const isActive = view === "group" && selectedId === g.id;
              const isAdmin = g.my_role === "admin" || g.my_role === "creator";
              const a = alerts[g.id];
              const adminCount = a?.pendingAdminRequests ?? 0;
              const hasAlert = (a?.pendingPresence ?? false) || adminCount > 0;
              return (
                <li key={g.id}>
                  <button
                    onClick={() => onSelect(g.id)}
                    className={`group flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all ${
                      isActive
                        ? "border-primary/40 bg-primary/10 shadow-sm"
                        : "border-transparent hover:border-border hover:bg-card"
                    }`}
                  >
                    <div className="relative">
                      {g.image_url ? (
                        <img
                          src={g.image_url}
                          alt=""
                          className="h-10 w-10 flex-shrink-0 rounded-lg object-cover ring-1 ring-border"
                        />
                      ) : (
                        <div
                          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ring-1 ${
                            isActive
                              ? "bg-primary/15 ring-primary/30"
                              : "bg-primary/10 ring-primary/15"
                          }`}
                        >
                          <Users className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      {isAdmin && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary ring-2 ring-background">
                          <Shield className="h-2 w-2 text-primary-foreground" />
                        </span>
                      )}
                      {hasAlert && (
                        <span
                          className="absolute -top-0.5 -right-0.5 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-warning px-1 text-[9px] font-bold text-warning-foreground ring-2 ring-background"
                          title={
                            adminCount > 0
                              ? `${adminCount} solicitação${adminCount !== 1 ? "ões" : ""} pendente`
                              : "Confirme sua presença"
                          }
                        >
                          {adminCount > 0 ? adminCount : "!"}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span
                          className={`truncate text-xs font-bold ${
                            isActive ? "text-foreground" : "text-foreground/90"
                          }`}
                        >
                          {g.name}
                        </span>
                        {g.is_public ? (
                          <Globe className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/50" />
                        ) : (
                          <Lock className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/50" />
                        )}
                      </div>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {g.member_count} membro{g.member_count !== 1 ? "s" : ""}
                        {g.current_season_name ? ` · ${g.current_season_name}` : ""}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Pending */}
        {pendingGroups.length > 0 && (
          <div className="mt-4 px-1">
            <p className="mb-1.5 flex items-center gap-1 px-2 text-[9px] font-bold uppercase tracking-wider text-warning">
              <Clock className="h-2.5 w-2.5" /> Aguardando
            </p>
            <ul className="space-y-1">
              {pendingGroups.map((p) => {
                const isResolved = p.status === "approved" || p.status === "rejected";
                const isApproved = p.status === "approved";
                return (
                  <li
                    key={p.id}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${
                      isApproved
                        ? "border-success/30 bg-success/10"
                        : p.status === "rejected"
                        ? "border-destructive/30 bg-destructive/10"
                        : "border-warning/20 bg-warning/5"
                    }`}
                  >
                    {isApproved ? (
                      <Bell className="h-3 w-3 flex-shrink-0 text-success" />
                    ) : p.status === "rejected" ? (
                      <Bell className="h-3 w-3 flex-shrink-0 text-destructive" />
                    ) : (
                      <Clock className="h-3 w-3 flex-shrink-0 text-warning" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{p.name}</span>
                    {isResolved && (
                      <span
                        className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                          isApproved
                            ? "bg-success text-success-foreground"
                            : "bg-destructive text-destructive-foreground"
                        }`}
                      >
                        {isApproved ? "Aprovado" : "Recusado"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Explore button */}
      <div className="border-t border-border/40 p-3">
        <button
          onClick={onSelectExplore}
          className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition-all ${
            view === "explore"
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border bg-card/60 text-muted-foreground hover:border-primary/30 hover:text-foreground"
          }`}
        >
          <Compass className="h-4 w-4 text-primary" />
          Explorar grupos
        </button>
      </div>
    </aside>
  );
}
