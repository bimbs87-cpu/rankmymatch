import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Abbreviate middle names: "João Carlos Silva" → "João C. Silva" */
export function abbreviateName(name: string): string {
  if (!name) return "Jogador";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const middle = parts.slice(1, -1).map(p => `${p[0]}.`).join(" ");
  return `${first} ${middle} ${last}`;
}
