import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown, Users, Trophy, UserSquare2, Compass, CheckCircle2, CalendarClock } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useGroupPendingTasks } from "@/hooks/use-group-pending-tasks";
import { useAllGroupsPending } from "@/hooks/use-all-groups-pending";
import { useNextRound } from "@/hooks/use-next-round";

interface GroupItem {
  id: string;
  name: string;
}

interface Props {
  groups: GroupItem[];
  /** Custom trigger renderer (so we can reuse the menu in different nav styles). */
  renderTrigger: (args: {
    onClick: () => void;
    badge: number;
    open: boolean;
  }) => ReactNode;
  /** Optional anchor classes for the popover panel position. */
  panelClassName?: string;
}

/**
 * Shared "Grupos" menu for BottomNav (mobile) + DesktopNav.
 * Detects the active /groups/{id} from the URL so the popover always promotes
 * the group the user is currently inside (instead of always group #0).
 */
export function GroupsNavMenu({ groups, renderTrigger, panelClassName }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Extract the active group id from the URL: /groups/{uuid}/...
  const activeGroupId = useMemo(() => {
    const m = location.pathname.match(/^\/groups\/([0-9a-f-]{36})/i);
    return m?.[1] ?? null;
  }, [location.pathname]);

  // Reorder so the active group (if any) is "primary"; otherwise keep order.
  const orderedGroups = useMemo(() => {
    if (!activeGroupId) return groups;
    const idx = groups.findIndex((g) => g.id === activeGroupId);
    if (idx <= 0) return groups;
    const copy = [...groups];
    const [active] = copy.splice(idx, 1);
    return [active, ...copy];
  }, [groups, activeGroupId]);

  const primary = orderedGroups[0];
  const primaryId = primary?.id ?? "";
  const primaryIsActive = !!activeGroupId && primaryId === activeGroupId;
  const { counts } = useGroupPendingTasks(primaryId || null, !!primaryId && orderedGroups.length > 1);
  const memberPending = counts.joinRequests + counts.playerClaims;

  // Aggregated badge across ALL groups (so the BottomNav/DesktopNav "Grupos"
  // trigger reflects every group where the user has pending admin tasks, not
  // only the primary one).
  const allGroupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const globalPending = useAllGroupsPending(allGroupIds);

  // Next scheduled round of the primary group (used in the popover shortcut).
  const { round: nextRound } = useNextRound(primaryId || null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // 0 groups → plain link to the groups index (where Explore / Create live).
  if (orderedGroups.length === 0) {
    return (
      <Link to="/groups" className="contents">
        {renderTrigger({ onClick: () => {}, badge: 0, open: false })}
      </Link>
    );
  }

  // 1 group → bypass popover, go straight to it.
  if (orderedGroups.length === 1) {
    return (
      <Link to="/groups/$groupId" params={{ groupId: primaryId }} className="contents">
        {renderTrigger({ onClick: () => {}, badge: globalPending, open: false })}
      </Link>
    );
  }

  // 2+ groups → popover with quick shortcuts + group list.
  const otherGroups = orderedGroups.slice(1);

  return (
    <div ref={ref} className="relative contents">
      {renderTrigger({ onClick: () => setOpen((v) => !v), badge: globalPending, open })}

      {open && (
        <div
          role="menu"
          className={
            panelClassName ??
            "absolute right-0 top-full z-50 mt-2 w-72 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-popover p-2 shadow-xl animate-fade-in"
          }
        >
          <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Menu direto do grupo
          </p>

          {primary && (
            <div
              className={`mb-2 rounded-xl p-1.5 ${
                primaryIsActive
                  ? "border-2 border-success/60 bg-success/10 ring-1 ring-success/30"
                  : "border border-primary/20 bg-primary/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-1.5 pb-1">
                <p
                  className={`truncate text-[10px] font-semibold ${
                    primaryIsActive ? "text-success" : "text-primary"
                  }`}
                  title={primary.name}
                >
                  {primary.name}
                </p>
                {primaryIsActive && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-success/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Atual
                  </span>
                )}
              </div>
              <ul className="space-y-0.5">
                {nextRound && (
                  <li>
                    <Link
                      to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                      params={{
                        groupId: primaryId,
                        seasonId: nextRound.season_id ?? "",
                        roundId: nextRound.id,
                      }}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between gap-2 rounded-lg bg-success/10 px-2 py-1.5 text-xs font-semibold text-foreground ring-1 ring-success/30 transition-colors hover:bg-success/20"
                    >
                      <span className="flex items-center gap-2">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-success" />
                        <span>Próxima rodada</span>
                      </span>
                      <span className="text-[10px] font-bold text-success">
                        {formatNextRound(nextRound.scheduled_date, nextRound.scheduled_time)}
                      </span>
                    </Link>
                  </li>
                )}
                <li>
                  <Link
                    to="/groups/$groupId"
                    params={{ groupId: primaryId }}
                    search={{ view: "seasons" } as any}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <Trophy className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>Agenda completa</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/groups/$groupId"
                    params={{ groupId: primaryId }}
                    search={{ view: "members" } as any}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <span className="flex items-center gap-2">
                      <UserSquare2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>Membros</span>
                    </span>
                    {memberPending > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                        {memberPending > 9 ? "9+" : memberPending}
                      </span>
                    )}
                  </Link>
                </li>
              </ul>
            </div>
          )}

          {otherGroups.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Outros grupos
              </p>
              <ul className="space-y-0.5">
                {otherGroups.map((g) => (
                  <OtherGroupItem
                    key={g.id}
                    group={g}
                    isActive={g.id === activeGroupId}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </ul>
            </>
          )}

          <div className="mt-2 border-t border-border/60 pt-1">
            <Link
              to="/groups"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Compass className="h-3.5 w-3.5 shrink-0" />
              <span>Ver todos / Explorar</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function OtherGroupItem({
  group,
  isActive,
  onNavigate,
}: {
  group: GroupItem;
  isActive: boolean;
  onNavigate: () => void;
}) {
  const { counts, loading } = useGroupPendingTasks(group.id, true);
  const total = counts.total;

  return (
    <li>
      <Link
        to="/groups/$groupId"
        params={{ groupId: group.id }}
        onClick={onNavigate}
        className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors hover:bg-accent ${
          isActive
            ? "bg-success/10 text-success ring-1 ring-success/40"
            : "text-foreground"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Users className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-success" : "text-primary"}`} />
          <span className="truncate">{group.name}</span>
          {isActive && (
            <span className="ml-1 inline-flex shrink-0 items-center rounded-full bg-success/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
              Atual
            </span>
          )}
        </span>
        {!loading && total > 0 && (
          <span
            title={`${counts.joinRequests} solicitações · ${counts.playerClaims} vínculos · ${counts.matchResults} resultados`}
            className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground"
          >
            {total > 9 ? "9+" : total}
          </span>
        )}
      </Link>
    </li>
  );
}
