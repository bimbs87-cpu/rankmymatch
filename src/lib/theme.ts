import { useState, useEffect, useCallback } from "react";

export type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getResolvedTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const resolved = getResolvedTheme(theme);
  document.documentElement.classList.toggle("light", resolved === "light");
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("rmm-theme") as Theme) || "dark";
  });

  const resolved = typeof window === "undefined" ? "dark" : getResolvedTheme(theme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("rmm-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const cycleTheme = useCallback(() => {
    setThemeState((prev) => {
      if (prev === "dark") return "light";
      if (prev === "light") return "system";
      return "dark";
    });
  }, []);

  return { theme, resolved, setTheme: setThemeState, cycleTheme };
}
