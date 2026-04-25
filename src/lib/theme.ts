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
  const cl = document.documentElement.classList;
  cl.toggle("dark", resolved === "dark");
  cl.toggle("light", resolved === "light");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem("rmm-theme") as Theme) || "dark";
    setThemeState(stored);
    setMounted(true);

    // Listen for theme changes from other useTheme() instances (or other tabs)
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Theme>).detail;
      const next = detail || ((localStorage.getItem("rmm-theme") as Theme) || "dark");
      setThemeState(next);
    };
    window.addEventListener("rmm-theme-change", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("rmm-theme-change", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const resolved = mounted ? getResolvedTheme(theme) : "dark";

  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    localStorage.setItem("rmm-theme", theme);
    window.dispatchEvent(new CustomEvent("rmm-theme-change", { detail: theme }));
  }, [theme, mounted]);

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
