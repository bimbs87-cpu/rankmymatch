/**
 * Rivalry mode detection and helpers for 1v1 groups with exactly 2 members.
 */

export function isRivalryGroup(
  group: {
    match_format?: string;
    singles_group_type?: string | null;
  } | null | undefined,
): boolean {
  if (!group) return false;
  return group.match_format === "singles" && group.singles_group_type === "rivalry";
}

export function getRivalryLabel(type: "tab" | "match" | "round" | "action"): string {
  switch (type) {
    case "tab": return "Duelo";
    case "match": return "Confronto";
    case "round": return "Rodada";
    case "action": return "Lançar Resultado";
    default: return "";
  }
}
