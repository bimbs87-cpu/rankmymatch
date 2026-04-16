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
      <div className="flex items-center justify-around rounded-full border border-border bg-card/80 px-2 py-2 backdrop-blur-xl">
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
              className={`relative flex flex-col items-center gap-0.5 rounded-full px-3 py-1.5 text-[10px] font-medium transition-all duration-200 ${
                isRanking ? "-mt-5" : ""
              } ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div
                className={`flex items-center justify-center transition-all duration-200 ${
                  isRanking
                    ? "h-14 w-14 -mt-6 rounded-full bg-card/95 shadow-lg border border-border/40"
                    : ""
                }`}
              >
                <Icon
                  className={`transition-all duration-200 ${
                    isRanking ? "h-7 w-7" : "h-5 w-5"
                  } ${isActive ? "scale-110" : ""}`}
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
