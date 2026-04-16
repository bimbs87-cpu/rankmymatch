/**
 * Rivalry mode detection and helpers for 1v1 groups with exactly 2 members.
 */

export function isRivalryGroup(group: {
  match_format?: string;
  singles_group_type?: string | null;
  max_players?: number;
} | null | undefined, memberCount?: number): boolean {
  if (!group) return false;
  const isSingles = group.match_format === "singles";
  const isRivalryType = group.singles_group_type === "rivalry";
  const hasTwoMembers = memberCount !== undefined ? memberCount <= 2 : group.max_players === 2;
  return isSingles && (isRivalryType || hasTwoMembers);
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
