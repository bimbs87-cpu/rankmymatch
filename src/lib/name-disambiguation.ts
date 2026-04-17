// Name disambiguation utility.
//
// Goal: Show only the first name when unique. If two players share the first
// name, append surname initials (1 letter), then 2 letters, etc., until each
// label is unique within the given group.
//
// Nicknames take precedence — if a player has a nickname, that's the displayed
// label and it does not participate in the disambiguation algorithm.

export interface NameInput {
  id: string;
  name: string;
  nickname?: string | null;
}

function tokens(full: string): string[] {
  return full.trim().split(/\s+/).filter(Boolean);
}

function firstName(full: string): string {
  return tokens(full)[0] || full || "Jogador";
}

function surname(full: string): string {
  const t = tokens(full);
  return t.length > 1 ? t[t.length - 1] : "";
}

/**
 * Build a map of user_id → display label, using as little of the surname as
 * possible while keeping every label unique within the input set.
 */
export function buildDisplayNames(people: NameInput[]): Map<string, string> {
  const result = new Map<string, string>();

  // Players with nicknames are resolved up-front and excluded from disambiguation.
  const remaining: NameInput[] = [];
  for (const p of people) {
    const nick = p.nickname?.trim();
    if (nick) {
      result.set(p.id, nick);
    } else {
      remaining.push(p);
    }
  }

  // Group by first name (case-insensitive)
  const groups = new Map<string, NameInput[]>();
  for (const p of remaining) {
    const key = firstName(p.name).toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  for (const [, group] of groups) {
    if (group.length === 1) {
      const p = group[0];
      result.set(p.id, firstName(p.name));
      continue;
    }

    // Multiple share first name — escalate surname prefix length until unique.
    let prefixLen = 1;
    let resolved = false;
    while (!resolved && prefixLen <= 10) {
      const labels = group.map((p) => {
        const sn = surname(p.name);
        const prefix = sn.slice(0, prefixLen);
        return prefix
          ? `${firstName(p.name)} ${prefix}${prefixLen === sn.length ? "" : "."}`
          : firstName(p.name);
      });
      const unique = new Set(labels.map((l) => l.toLowerCase())).size === labels.length;
      if (unique) {
        group.forEach((p, idx) => result.set(p.id, labels[idx]));
        resolved = true;
      } else {
        prefixLen += 1;
      }
    }

    if (!resolved) {
      // Fallback: append a numeric suffix
      group.forEach((p, idx) => {
        const sn = surname(p.name);
        result.set(p.id, sn ? `${firstName(p.name)} ${sn}` : `${firstName(p.name)} #${idx + 1}`);
      });
    }
  }

  return result;
}

/**
 * Returns the set of first-name keys that have collisions in the given list.
 * Useful to drive UX warnings (e.g. "add a nickname").
 */
export function getCollidingFirstNames(people: NameInput[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of people) {
    if (p.nickname?.trim()) continue; // nickname users are unambiguous
    const key = firstName(p.name).toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}
