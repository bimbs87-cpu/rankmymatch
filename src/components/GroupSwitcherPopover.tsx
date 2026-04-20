import { Link } from "@tanstack/react-router";
import { ChevronDown, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface GroupItem {
  id: string;
  name: string;
}

interface Props {
  groups: GroupItem[];
  activeGroupId: string;
}

/**
 * Small button that opens a popover listing the user's other active groups
 * so they can quickly jump into a different group's internal page.
 */
export function GroupSwitcherPopover({ groups, activeGroupId }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  if (groups.length === 0) return null;

  // Single group: render direct link to that group (no popover).
  if (groups.length === 1) {
    const only = groups[0];
    return (
      <Link
        to="/groups/$groupId"
        params={{ groupId: only.id }}
        aria-label={`Abrir grupo ${only.name}`}
        title={`Abrir grupo ${only.name}`}
        className="flex items-center gap-1 rounded-2xl border border-border bg-card px-2 py-2 text-muted-foreground transition-colors hover:bg-accent hover:border-primary/40"
      >
        <Users className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Trocar de grupo"
        title="Trocar de grupo"
        aria-expanded={open}
        className="flex items-center gap-0.5 rounded-2xl border border-border bg-card px-2 py-2 text-muted-foreground transition-colors hover:bg-accent hover:border-primary/40"
      >
        <Users className="h-4 w-4" />
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-popover p-2 shadow-xl animate-fade-in"
        >
          <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Trocar de grupo
          </p>
          <ul className="space-y-0.5">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  to="/groups/$groupId"
                  params={{ groupId: g.id }}
                  onClick={() => setOpen(false)}
                  aria-current={g.id === activeGroupId ? "page" : undefined}
                  className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <Users className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">{g.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
