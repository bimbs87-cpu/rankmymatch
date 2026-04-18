import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Abbreviate name: 1 word → as is; 2+ words → "First L." */
export function abbreviateName(name?: string | null): string {
  const safe = (name || "").trim();
  if (!safe) return "Jogador";
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return safe;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
