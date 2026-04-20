import { LayoutGrid, Users, Settings2, ChevronLeft, X, GitCompare, Share2, Trophy, ListChecks } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Link } from "@tanstack/react-router";

export type GroupView = "overview" | "members" | "seasons" | "compare" | "admin";

export interface SidebarBadges {
  pendingRequests?: number;
  pendingPresence?: boolean;
}

interface Item {
  id: GroupView;
  label: string;
  shortLabel?: string;
  icon: typeof LayoutGrid;
  adminOnly?: boolean;
}

const ITEMS: Item[] = [
  { id: "overview", label: "Visão geral", shortLabel: "Visão", icon: LayoutGrid },
  { id: "members", label: "Membros", shortLabel: "", icon: Users },
  { id: "seasons", label: "Agenda e resultados", shortLabel: "", icon: ListChecks },
  { id: "compare", label: "Comparar", shortLabel: "", icon: GitCompare },
  { id: "admin", label: "Admin", icon: Settings2, adminOnly: true },
];

interface Props {
  groupName: string;
  groupImage?: string | null;
  memberCount: number;
  isAdmin: boolean;
  view: GroupView;
  onSelect: (v: GroupView) => void;
  badges?: SidebarBadges;
  /** Called when the user taps the "Compartilhar grupo" shortcut. */
  onShareClick?: () => void;
}

export function GroupInternalSidebar({
  groupName,
  groupImage,
  memberCount,
  isAdmin,
  view,
  onSelect,
  badges = {},
  onShareClick,
}: Props) {
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border/60 p-4">
        <Link
          to="/groups"
          className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Meus grupos
        </Link>
        <Link
          to="/profile"
          aria-label="Abrir meu perfil"
          className="group flex items-center gap-3 rounded-2xl -m-1 p-1 transition-colors hover:bg-accent/30"
        >
          {groupImage ? (
            <img
              src={groupImage}
              alt={groupName}
              className="h-11 w-11 rounded-2xl object-cover transition-all duration-200 group-hover:scale-105 group-hover:shadow-[0_0_0_2px_hsl(var(--primary)/0.4)]"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 transition-all duration-200 group-hover:scale-105 group-hover:bg-primary/20">
              <span className="font-display text-base font-bold text-primary">
                {groupName.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-sm font-bold text-foreground group-hover:text-primary transition-colors">{groupName}</h2>
            <p className="text-[11px] text-muted-foreground">{memberCount} membros ativos</p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            const badgeCount =
              item.id === "admin" ? badges.pendingRequests : undefined;
            const dot =
              item.id === "overview" && badges.pendingPresence;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onSelect(item.id)}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {dot && <span className="h-2 w-2 rounded-full bg-warning" />}
                  {badgeCount && badgeCount > 0 ? (
                    <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                      {badgeCount}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        {onShareClick && (
          <div className="mt-3 border-t border-border/50 pt-3">
            <button
              onClick={onShareClick}
              className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/30 px-3 py-2.5 text-left text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <Share2 className="h-4 w-4" />
              <span className="flex-1 truncate">Compartilhar grupo</span>
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}

interface DrawerProps extends Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function GroupInternalSidebarDrawer({ open, onOpenChange, ...rest }: DrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] p-0 [&>button]:hidden">
        <div className="relative h-full">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <GroupInternalSidebar
            {...rest}
            onSelect={(v) => {
              rest.onSelect(v);
              onOpenChange(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Sticky, always-visible group menu for mobile. Sits flush below the page
 * topbar so it never covers the cover image at initial scroll, and remains
 * pinned to the top while scrolling. Visually distinct from the main app
 * bottom nav: pill-shaped, labeled "Menu do grupo", floating with elevation.
 */
interface FloatingTabsProps {
  isAdmin: boolean;
  view: GroupView;
  onSelect: (v: GroupView) => void;
  badges?: SidebarBadges;
}
export function GroupInternalFloatingTabs({ isAdmin, view, onSelect, badges = {} }: FloatingTabsProps) {
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin);
  return (
    <div className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-background/85 px-3 pb-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl lg:hidden">
      {/* Context label — makes it clear this is the group's internal menu */}
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
          Menu do grupo
        </span>
        <Link
          to="/ranking"
          aria-label="Ranking"
          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Trophy className="h-2.5 w-2.5" />
          Ranking
        </Link>
      </div>
      <div className="rounded-2xl border border-primary/20 bg-card/95 p-1 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.25)] ring-1 ring-black/30 backdrop-blur-xl">
        <ul className="flex items-stretch justify-between gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            const badgeCount =
              item.id === "admin" ? badges.pendingRequests : undefined;
            const dot = item.id === "overview" && badges.pendingPresence;
            const showLabel = !!(item.shortLabel ?? item.label);
            return (
              <li key={item.id} className="min-w-0 flex-1">
                <button
                  onClick={() => onSelect(item.id)}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold transition-all ${
                    active
                      ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]"
                      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-5 w-5 shrink-0 ${active ? "drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]" : ""}`} />
                  {showLabel && (
                    <span className="max-w-full truncate leading-none">
                      {item.shortLabel ?? item.label}
                    </span>
                  )}
                  {dot && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-warning ring-2 ring-card" />
                  )}
                  {badgeCount && badgeCount > 0 ? (
                    <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground ring-2 ring-card">
                      {badgeCount}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

