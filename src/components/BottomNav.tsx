import { Link, useLocation } from "@tanstack/react-router";
import { Home, Users, User, Crown, BarChart3 } from "lucide-react";
import { APP_VERSION } from "@/lib/app-version";
import { useNewReleasesCount } from "@/hooks/use-new-releases";

const NAV_ITEMS = [
  { to: "/", icon: Home, label: "Início" },
  { to: "/profile", icon: User, label: "Perfil" },
  { to: "/ranking", icon: Crown, label: "Ranking" },
  { to: "/groups", icon: Users, label: "Grupos" },
  { to: "/comparar", icon: BarChart3, label: "Comparar" },
] as const;

export function BottomNav() {
  const location = useLocation();
  const newReleases = useNewReleasesCount();

  return (
    <nav className="fixed bottom-5 left-4 right-4 z-50 mx-auto max-w-lg lg:hidden">
      <Link
        to="/sobre-desenvolvimento"
        className="absolute -top-6 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 py-0.5 font-mono text-[9px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-primary"
        aria-label="Sobre o desenvolvimento"
      >
        {APP_VERSION}
        {newReleases > 0 && (
          <span className="inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary px-1 font-sans text-[8px] font-bold text-primary-foreground">
            {newReleases > 9 ? "9+" : newReleases}
          </span>
        )}
      </Link>
      <div className="flex items-end justify-around rounded-full border border-border bg-card/80 px-2 py-2 backdrop-blur-xl">
        {NAV_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.to ||
            (item.to !== "/" && location.pathname.startsWith(item.to));
          const Icon = item.icon;
          const isRanking = item.to === "/ranking";
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`relative flex flex-col items-center rounded-full px-3 text-[10px] font-medium transition-all duration-200 ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isRanking ? (
                <div className="flex h-12 w-12 -mt-7 mb-0.5 items-center justify-center rounded-full border border-border bg-muted shadow-lg text-foreground">
                  <Icon className="h-7 w-7" strokeWidth={isActive ? 2.5 : 1.5} />
                </div>
              ) : (
                <div className="flex h-6 items-center justify-center mb-0.5">
                  <Icon
                    className={`h-5 w-5 transition-all duration-200 ${isActive ? "scale-110" : ""}`}
                    strokeWidth={isActive ? 2.5 : 1.5}
                  />
                </div>
              )}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
