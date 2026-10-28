import { useEffect } from "react";

// Accept legacy preferences for compatibility, but never resolve to a light theme.
export type Theme = "light" | "dark" | "system";
export function getResolvedTheme(_theme: Theme): "light" | "dark" {
  return "dark";
}

export function useTheme() {
  useEffect(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
    try { localStorage.setItem("rmm-theme", "dark"); } catch { /* Storage may be unavailable. */ }
  }, []);
  return { theme: "dark" as Theme, resolved: getResolvedTheme("dark") };
}
