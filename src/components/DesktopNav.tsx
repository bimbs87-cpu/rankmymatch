import { Link } from "@tanstack/react-router";
import { Home, User, Crown, Users, Bell, Sparkles } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useTheme } from "@/lib/theme";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import logoSymbolNeon from "@/assets/logo-symbol-neon.png";
import logoSymbolBlack from "@/assets/logo-symbol-black.png";

const NAV_ITEMS = [
  { to: "/" as const, icon: Home, label: "Início" },
  { to: "/profile" as const, icon: User, label: "Perfil" },
  { to: "/ranking" as const, icon: Crown, label: "Ranking" },
  { to: "/groups" as const, icon: Users, label: "Grupos" },
  { to: "/sistema" as const, icon: Sparkles, label: "Sistema" },
];

export function DesktopNav() {
  const { unreadCount } = useNotifications();
  const { displayName, nickname, avatarUrl } = useUserProfile();
  const { resolved: resolvedTheme } = useTheme();
  const headerName = nickname || displayName || "Você";

  return (
    <header className="hidden lg:block z-40 -mx-8 px-8 pt-6 pb-3 bg-background border-b border-border/40">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
        {/* Left: avatar + name */}
        <Link to="/profile" className="flex items-center gap-3 min-w-0 group">
          <PlayerAvatar
            avatarUrl={avatarUrl}
            name={headerName}
            size="lg"
            className="border border-border !h-10 !w-10"
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
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-primary/15 [&.active]:text-primary"
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Right: logo + notifications */}
        <div className="flex items-center gap-2">
          <img
            src={resolvedTheme === "light" ? logoSymbolBlack : logoSymbolNeon}
            alt="RankMyMatch"
            className="h-7 w-7"
          />
          <Link
            to="/notifications"
            className="relative rounded-full border border-border bg-card p-2.5 transition-colors hover:bg-accent"
          >
            <Bell className="h-4 w-4 text-muted-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
