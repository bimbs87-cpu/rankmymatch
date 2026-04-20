import { Link, useLocation } from "@tanstack/react-router";
import { Home, Users, User, Crown, BarChart3, Inbox, CalendarClock } from "lucide-react";
import { APP_VERSION } from "@/lib/app-version";
import { useNewReleasesCount } from "@/hooks/use-new-releases";
import { useAdminPendingCount } from "@/hooks/use-admin-pending-count";
import { useMyGroups } from "@/hooks/use-groups";
import { GroupsNavMenu } from "@/components/GroupsNavMenu";
import { SafeBoundary } from "@/components/SafeBoundary";
import { Skeleton } from "@/components/ui/skeleton";
import { isRivalryGroup } from "@/lib/rivalry";

const NAV_ITEMS = [
  { to: "/", icon: Home, label: "Início" },
  { to: "/profile", icon: User, label: "Perfil" },
  { to: "/ranking", icon: Crown, label: "Ranking" },
  { to: "/groups", icon: Users, label: "Grupos", isGroups: true } as any,
  { to: "/comparar", icon: BarChart3, label: "Comparar" },
] as const;

export function BottomNav() {
  const location = useLocation();
  const newReleases = useNewReleasesCount();
  const { count: adminPending } = useAdminPendingCount();
  const { groups: myGroups } = useMyGroups();
  const activeGroupId = location.pathname.match(/^\/groups\/([0-9a-f-]{36})/i)?.[1] ?? null;
  const activeGroup = myGroups.find((group) => group.id === activeGroupId) ?? null;
  const shouldOpenDuelFromRanking = !!activeGroup && activeGroup.match_format === "singles" && (isRivalryGroup(activeGroup) || activeGroup.member_count <= 2);

  return (
    <>
      {adminPending > 0 && (
        <Link
          to="/admin/inbox"
          aria-label={`${adminPending} solicitações de admin pendentes`}
          className="fixed bottom-24 right-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-warning/40 bg-warning text-warning-foreground shadow-lg transition-transform hover:scale-105 lg:hidden"
        >
          <Inbox className="h-5 w-5" />
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {adminPending > 9 ? "9+" : adminPending}
          </span>
        </Link>
      )}
      <Link
        to="/sobre-desenvolvimento"
        className="fixed bottom-1 right-2 z-40 inline-flex items-center gap-1 rounded-full bg-transparent px-1.5 py-0.5 font-mono text-[8px] font-medium text-muted-foreground/50 transition-colors hover:text-primary lg:hidden"
        aria-label="Sobre o desenvolvimento"
      >
        {APP_VERSION}
        {newReleases > 0 && (
          <span className="inline-flex h-3 min-w-[12px] items-center justify-center rounded-full bg-primary px-1 font-sans text-[7px] font-bold text-primary-foreground">
            {newReleases > 9 ? "9+" : newReleases}
          </span>
        )}
      </Link>
      <nav className="fixed bottom-5 left-4 right-4 z-50 mx-auto max-w-lg lg:hidden">
      <div className="flex items-end justify-around rounded-full border border-border bg-card/80 px-2 py-2 backdrop-blur-xl">
        {NAV_ITEMS.map((item: any) => {
          const isActive = item.to === "/ranking"
            ? location.pathname === "/ranking" || (shouldOpenDuelFromRanking && location.pathname === `/groups/${activeGroup?.id}/duel`)
            : location.pathname === item.to ||
              (item.to !== "/" && location.pathname.startsWith(item.to));
          const Icon = item.icon;
          const isRanking = item.to === "/ranking";

          const renderInner = (badge = 0, badgeLoading = false) => (
            <>
              {isRanking ? (
                <div className="flex h-12 w-12 -mt-7 mb-0.5 items-center justify-center rounded-full border border-border bg-muted shadow-lg text-foreground">
                  <Icon className="h-7 w-7" strokeWidth={isActive ? 2.5 : 1.5} />
                </div>
              ) : (
                <div className="relative flex h-6 items-center justify-center mb-0.5">
                  <Icon
                    className={`h-5 w-5 transition-all duration-200 ${isActive ? "scale-110" : ""}`}
                    strokeWidth={isActive ? 2.5 : 1.5}
                  />
                  {badgeLoading ? (
                    <Skeleton className="absolute -right-1.5 -top-1 h-3.5 w-3.5 rounded-full" />
                  ) : badge > 0 ? (
                    <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive px-1 text-[8px] font-bold text-destructive-foreground">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </div>
              )}
              <span>{item.label}</span>
            </>
          );

          const baseClasses = `relative flex flex-col items-center rounded-full px-3 text-[10px] font-medium transition-all duration-200 ${
            isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`;

          if (item.isGroups) {
            return (
              <SafeBoundary
                key={item.to}
                label="GroupsNavMenu(BottomNav)"
                fallback={
                  <Link to="/groups" className={baseClasses} aria-label="Grupos">
                    {renderInner(0, false)}
                  </Link>
                }
              >
                <GroupsNavMenu
                  groups={myGroups.map((g) => ({ id: g.id, name: g.name }))}
                  panelClassName="absolute bottom-full left-1/2 z-[60] mb-2 w-72 max-h-[60vh] -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-2xl ring-1 ring-black/30 animate-fade-in"
                  renderTrigger={({ onClick, badge, badgeLoading, nextRound }) => (
                    <div className="relative flex flex-col items-center">
                      <button type="button" onClick={onClick} className={baseClasses} aria-label="Grupos">
                        {renderInner(badge, badgeLoading)}
                      </button>
                      {nextRound && (
                        <Link
                          to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                          params={{
                            groupId: myGroups[0]?.id ?? "",
                            seasonId: nextRound.seasonId,
                            roundId: nextRound.id,
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[8px] font-bold text-success leading-none ring-1 ring-success/30 hover:bg-success/25"
                          aria-label="Abrir próxima rodada"
                        >
                          <CalendarClock className="h-2 w-2" />
                          {nextRound.label}
                          {nextRound.presence === "confirmed" && <span aria-hidden>✓</span>}
                          {nextRound.presence === "pending" && <span aria-hidden>⏳</span>}
                          {nextRound.presence === "declined" && <span aria-hidden>✗</span>}
                        </Link>
                      )}
                    </div>
                  )}
                />
              </SafeBoundary>
            );
          }

          if (isRanking && shouldOpenDuelFromRanking && activeGroup) {
            return (
              <Link key={item.to} to="/groups/$groupId/duel" params={{ groupId: activeGroup.id }} className={baseClasses}>
                {renderInner()}
              </Link>
            );
          }

          if (isRanking && activeGroup) {
            return (
              <Link key={item.to} to="/ranking" search={{ group: activeGroup.id }} className={baseClasses}>
                {renderInner()}
              </Link>
            );
          }

          return (
            <Link key={item.to} to={item.to} className={baseClasses}>
              {renderInner()}
            </Link>
          );
        })}
      </div>
      </nav>
    </>
  );
}
