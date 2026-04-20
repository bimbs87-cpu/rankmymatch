import { Link } from "@tanstack/react-router";
import { ChevronDown, Users, Trophy, UserSquare2, Compass } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useGroupPendingTasks } from "@/hooks/use-group-pending-tasks";

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
 * Shared "Grupos" menu that powers both the BottomNav (mobile) and DesktopNav.
 *
 * Behavior:
 * - 0 groups → trigger acts as a plain Link to /groups (Explorar / Criar UI lives there).
 * - 1 group  → trigger acts as a plain Link straight into that group (no popover —
 *              avoids an unnecessary extra click for users with a single group).
 * - 2+ groups → trigger opens a popover listing the user's groups with quick
 *              shortcuts (Agenda / Membros) for the first one and direct
 *              navigation to the others. Mirrors the in-group switcher popover.
 */
export function GroupsNavMenu({ groups, renderTrigger, panelClassName }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Use the first group as the "active context" for shortcuts (matches the
  // in-app convention used by GroupSwitcherPopover).
  const primary = groups[0];
  const primaryId = primary?.id ?? "";
  const { counts } = useGroupPendingTasks(primaryId || null, !!primaryId && groups.length > 1);
  const memberPending = counts.joinRequests + counts.playerClaims;

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
  if (groups.length === 0) {
    return (
      <Link to="/groups" className="contents">
        {renderTrigger({ onClick: () => {}, badge: 0, open: false })}
      </Link>
    );
  }

  // 1 group → bypass popover, go straight to it.
  if (groups.length === 1) {
    return (
      <Link to="/groups/$groupId" params={{ groupId: primaryId }} className="contents">
        {renderTrigger({ onClick: () => {}, badge: memberPending, open: false })}
      </Link>
    );
  }

  // 2+ groups → popover with quick shortcuts + group list.
  const otherGroups = groups.slice(1);

  return (
    <div ref={ref} className="relative contents">
      {renderTrigger({ onClick: () => setOpen((v) => !v), badge: memberPending, open })}

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
            <div className="mb-2 rounded-xl border border-primary/20 bg-primary/5 p-1.5">
              <p className="px-1.5 pb-1 text-[10px] font-semibold text-primary truncate" title={primary.name}>
                {primary.name}
              </p>
              <ul className="space-y-0.5">
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
                  <OtherGroupItem key={g.id} group={g} onNavigate={() => setOpen(false)} />
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

function OtherGroupItem({ group, onNavigate }: { group: GroupItem; onNavigate: () => void }) {
  const { counts, loading } = useGroupPendingTasks(group.id, true);
  const total = counts.total;

  return (
    <li>
      <Link
        to="/groups/$groupId"
        params={{ groupId: group.id }}
        onClick={onNavigate}
        className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Users className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{group.name}</span>
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
