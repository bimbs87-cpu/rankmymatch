import { Link } from "@tanstack/react-router";
import { ChevronDown, Users, Trophy, ListChecks, UserSquare2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useGroupPendingTasks } from "@/hooks/use-group-pending-tasks";

interface GroupItem {
  id: string;
  name: string;
}

interface Props {
  groups: GroupItem[];
  activeGroupId: string;
  /** Optional: name of the active group, used to label the quick-shortcut section. */
  activeGroupName?: string;
}

/**
 * Small button that opens a popover acting as a "direct group menu":
 * - Quick shortcuts for the active group (Temporadas, Resultados, Membros).
 * - Optional list of the user's other groups, so they can hop straight to one.
 *
 * Shows a red dot on the trigger and a count badge next to "Membros" when the
 * active group has admin pending tasks (join requests + claims).
 */
export function GroupSwitcherPopover({ groups, activeGroupId, activeGroupName }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { counts } = useGroupPendingTasks(activeGroupId || null, !!activeGroupId);
  const memberPending = counts.joinRequests + counts.playerClaims;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  // No groups at all — nothing useful to show.
  if (!activeGroupId && groups.length === 0) return null;

  const otherGroups = groups.filter((g) => g.id !== activeGroupId);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu direto do grupo"
        title="Menu direto do grupo"
        aria-expanded={open}
        className="relative flex items-center gap-0.5 rounded-2xl border border-border bg-card px-2 py-2 text-muted-foreground transition-colors hover:bg-accent hover:border-primary/40"
      >
        <Users className="h-4 w-4" />
        <ChevronDown className="h-3 w-3" />
        {memberPending > 0 && (
          <span
            aria-label={`${memberPending} pendência${memberPending === 1 ? "" : "s"} no grupo ativo`}
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground"
          >
            {memberPending > 9 ? "9+" : memberPending}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-72 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-popover p-2 shadow-xl animate-fade-in"
        >
          <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Menu direto do grupo
          </p>

          {/* Quick shortcuts for the ACTIVE group */}
          {activeGroupId && (
            <div className="mb-2 rounded-xl border border-primary/20 bg-primary/5 p-1.5">
              {activeGroupName && (
                <p className="px-1.5 pb-1 text-[10px] font-semibold text-primary truncate" title={activeGroupName}>
                  {activeGroupName}
                </p>
              )}
              <ul className="space-y-0.5">
                <li>
                  <Link
                    to="/groups/$groupId"
                    params={{ groupId: activeGroupId }}
                    search={{ view: "seasons" } as any}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <Trophy className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>Agenda e resultados</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/groups/$groupId"
                    params={{ groupId: activeGroupId }}
                    search={{ view: "members" } as any}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <span className="flex items-center gap-2">
                      <UserSquare2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>Membros</span>
                    </span>
                    {memberPending > 0 && (
                      <span
                        aria-label={`${memberPending} pendência${memberPending === 1 ? "" : "s"}`}
                        className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground"
                      >
                        {memberPending > 9 ? "9+" : memberPending}
                      </span>
                    )}
                  </Link>
                </li>
              </ul>
            </div>
          )}

          {/* Other groups */}
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
        </div>
      )}
    </div>
  );
}

/**
 * Row in "Outros grupos" — lazy-loads pending-tasks count on hover so admins
 * can see at-a-glance which other groups need attention without a heavy fetch
 * for every group on popover open.
 */
function OtherGroupItem({
  group,
  onNavigate,
}: {
  group: GroupItem;
  onNavigate: () => void;
}) {
  // Preload pending counts immediately when the popover opens so admins can
  // see at a glance which groups need attention — no hover required.
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
            aria-label={`${total} pendência${total === 1 ? "" : "s"}`}
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
