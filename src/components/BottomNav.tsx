import { Link, useLocation } from "@tanstack/react-router";
import { Home, Users, Trophy, BarChart3, User } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", icon: Home, label: "Início" },
  { to: "/groups", icon: Users, label: "Grupos" },
  { to: "/seasons", icon: Trophy, label: "Temporadas" },
  { to: "/ranking", icon: BarChart3, label: "Ranking" },
  { to: "/profile", icon: User, label: "Perfil" },
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
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-0.5 rounded-full px-3 py-1.5 text-[10px] font-medium transition-all duration-200 ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon
                className={`h-5 w-5 transition-all duration-200 ${
                  isActive ? "scale-110" : ""
                }`}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
