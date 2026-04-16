import { Link, useLocation } from "@tanstack/react-router";
import { Home, Users, User, Bell, Crown } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", icon: Home, label: "Início" },
  { to: "/profile", icon: User, label: "Perfil" },
  { to: "/ranking", icon: Crown, label: "Ranking" },
  { to: "/groups", icon: Users, label: "Grupos" },
  { to: "/notifications", icon: Bell, label: "Alertas" },
] as const;

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-5 left-4 right-4 z-50 mx-auto max-w-lg">
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
