import { Link, useLocation } from "@tanstack/react-router";
import { Home, User, Crown, Users, Bell, BarChart3, Wrench } from "lucide-react";
import { useAppAdmin } from "@/hooks/use-app-admin";
import { useNotifications } from "@/hooks/use-notifications";
import { useAdminPendingCount } from "@/hooks/use-admin-pending-count";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useMyGroups } from "@/hooks/use-groups";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { GroupSwitcherPopover } from "@/components/GroupSwitcherPopover";
import { GroupsNavMenu } from "@/components/GroupsNavMenu";
import { SafeBoundary } from "@/components/SafeBoundary";
import { isRivalryGroup } from "@/lib/rivalry";

const NAV_ITEMS = [
  { to: "/" as const, icon: Home, label: "Início", isGroups: false },
  { to: "/profile" as const, icon: User, label: "Perfil", isGroups: false },
  { to: "/ranking" as const, icon: Crown, label: "Ranking", isGroups: false },
  { to: "/groups" as const, icon: Users, label: "Grupos", isGroups: true },
  { to: "/comparar" as const, icon: BarChart3, label: "Comparar", isGroups: false },
];

export function DesktopNav() {
  const location = useLocation();
  const { unreadCount } = useNotifications();
  const { count: adminPending } = useAdminPendingCount();
  const totalBadge = unreadCount + adminPending;
  const { displayName, nickname, avatarUrl } = useUserProfile();
  const { groups: myGroups } = useMyGroups();
  const { isAppAdmin } = useAppAdmin();
  const headerName = nickname || displayName || "Você";
  const activeGroupIdFromPath = location.pathname.match(/^\/groups\/([0-9a-f-]{36})/i)?.[1] ?? null;
  const activeGroup = myGroups.find((group) => group.id === activeGroupIdFromPath) ?? myGroups[0];
  const activeGroupId = activeGroup?.id ?? "";
  const activeGroupName = activeGroup?.name ?? "";
  const shouldOpenDuelFromRanking = !!activeGroup && activeGroup.match_format === "singles" && (isRivalryGroup(activeGroup) || activeGroup.member_count <= 2);

  return (
    <header className="hidden lg:block sticky top-3 z-40 -mx-5 mt-3 px-6 py-3 bg-background/85 backdrop-blur-xl border border-border/40 rounded-3xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
        {/* Left: avatar + name */}
        <Link to="/profile" aria-label="Abrir perfil" className="group flex items-center gap-3 min-w-0">
          <PlayerAvatar
            avatarUrl={avatarUrl}
            name={headerName}
            size="lg"
            className="border border-border !h-10 !w-10 transition-all duration-200 group-hover:scale-105 group-hover:border-primary group-hover:shadow-[0_0_0_3px_hsl(var(--primary)/0.18),0_0_16px_hsl(var(--primary)/0.35)]"
          />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Olá,
            </p>
            <p className="font-display text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
              {headerName}
            </p>
          </div>
        </Link>

        {/* Center: nav pill */}
        <nav className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-1 rounded-full border border-border bg-card/80 px-2 py-1.5 backdrop-blur-xl">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const baseClasses =
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-primary/15 [&.active]:text-primary";

              if (item.isGroups) {
                return (
                  <SafeBoundary
                    key={item.to}
                    label="GroupsNavMenu(DesktopNav)"
                    fallback={
                      <Link to="/groups" className={baseClasses}>
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    }
                  >
                    <GroupsNavMenu
                      groups={myGroups.map((g) => ({ id: g.id, name: g.name }))}
                      panelClassName="pointer-events-auto max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-popover p-2 shadow-2xl ring-1 ring-black/40 animate-fade-in"
                      renderTrigger={({ onClick, badge, badgeLoading, open }) => (
                        <button
                          type="button"
                          onClick={onClick}
                          aria-expanded={open}
                          className={`${baseClasses} relative ${open ? "bg-primary/15 text-primary" : ""}`}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                          {badgeLoading ? (
                            <span className="ml-0.5 inline-block h-4 w-4 animate-pulse rounded-full bg-primary/20" />
                          ) : badge > 0 ? (
                            <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                              {badge > 9 ? "9+" : badge}
                            </span>
                          ) : null}
                        </button>
                      )}
                    />
                  </SafeBoundary>
                );
              }

              if (item.to === "/ranking" && shouldOpenDuelFromRanking && activeGroup) {
                return (
                  <Link
                    key={item.to}
                    to="/groups/$groupId/duel"
                    params={{ groupId: activeGroup.id }}
                    activeOptions={{ exact: true }}
                    className={baseClasses}
                  >
                    <Icon className="h-4 w-4" />
                    <span>Duelo</span>
                  </Link>
                );
              }

              if (item.to === "/ranking" && activeGroup) {
                return (
                  <Link
                    key={item.to}
                    to="/ranking"
                    search={{ group: activeGroup.id }}
                    activeOptions={{ exact: true }}
                    className={baseClasses}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              }

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className={baseClasses}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Right: group switcher + notifications */}
        <div className="flex items-center gap-2">
          {myGroups.length > 0 && (
            <GroupSwitcherPopover groups={myGroups} activeGroupId={activeGroupId} activeGroupName={activeGroupName} />
          )}
          {adminPending > 0 && (
            <Link
              to="/admin/inbox"
              aria-label={`${adminPending} solicitações de admin pendentes`}
              className="relative rounded-full border border-warning/40 bg-warning/10 p-2.5 transition-colors hover:bg-warning/20"
            >
              <Users className="h-4 w-4 text-warning" />
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[9px] font-bold text-warning-foreground">
                {adminPending > 9 ? "9+" : adminPending}
              </span>
            </Link>
          )}
          <NotificationsPopover>
            <button
              aria-label={totalBadge > 0 ? `${totalBadge} notificações` : "Notificações"}
              className="relative rounded-full border border-border bg-card p-2.5 transition-colors hover:bg-accent"
            >
              <Bell className="h-4 w-4 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-background tabular-nums">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </NotificationsPopover>
        </div>
      </div>
    </header>
  );
}
