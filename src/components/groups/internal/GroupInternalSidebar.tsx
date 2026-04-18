import { LayoutGrid, Users, BarChart3, Trophy, MessageSquare, Settings2, ChevronLeft, X, GitCompare } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Link } from "@tanstack/react-router";

export type GroupView = "overview" | "members" | "results" | "seasons" | "compare" | "feed" | "admin";

export interface SidebarBadges {
  pendingRequests?: number;
  pendingPresence?: boolean;
  newComments?: number;
}

interface Item {
  id: GroupView;
  label: string;
  icon: typeof LayoutGrid;
  adminOnly?: boolean;
}

const ITEMS: Item[] = [
  { id: "overview", label: "Visão geral", icon: LayoutGrid },
  { id: "members", label: "Membros", icon: Users },
  { id: "results", label: "Resultados", icon: BarChart3 },
  { id: "seasons", label: "Temporadas", icon: Trophy },
  { id: "feed", label: "Feed", icon: MessageSquare },
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
}

export function GroupInternalSidebar({
  groupName,
  groupImage,
  memberCount,
  isAdmin,
  view,
  onSelect,
  badges = {},
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
        <div className="flex items-center gap-3">
          {groupImage ? (
            <img src={groupImage} alt={groupName} className="h-11 w-11 rounded-2xl object-cover" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
              <span className="font-display text-base font-bold text-primary">
                {groupName.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-sm font-bold text-foreground">{groupName}</h2>
            <p className="text-[11px] text-muted-foreground">{memberCount} membros ativos</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            const badgeCount =
              item.id === "admin" ? badges.pendingRequests :
              item.id === "feed" ? badges.newComments : undefined;
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
