/**
 * Duel medals — computed from head-to-head match history between two players.
 *
 * Medals:
 *  - Carrasco: most direct wins against the opponent
 *  - Invicto: longest unbeaten streak in the H2H
 *  - Rei da Virada: most comeback wins (lost 1st set, won the match)
 *  - Freguês: most direct losses (mirror of Carrasco)
 *  - Mestre dos Sets: most sets won across all H2H matches (regardless of match win)
 *  - Pé Quente: most wins in the last 5 H2H matches
 */

export interface MedalMatchInput {
  winner_user_id: string | null;
  status: string;
  sets: { scoreA: number; scoreB: number }[];
  /** Order of players in sets — match_players team A user_id */
  team_a_user_id?: string | null;
}

export interface MedalResult {
  /** "A" | "B" | null when undecided / tied / not enough data */
  holder: "A" | "B" | null;
  /** Number associated with the medal (wins, streak, comebacks). */
  value: number;
  /** Short helper line for UI. */
  hint: string;
}

export interface DuelMedals {
  carrasco: MedalResult;
  invicto: MedalResult;
  reiDaVirada: MedalResult;
  fregues: MedalResult;
  mestreDosSets: MedalResult;
  peQuente: MedalResult;
}

export function computeDuelMedals(
  matches: MedalMatchInput[],
  playerAId: string,
  playerBId: string,
): DuelMedals {
  const completed = matches.filter((m) => m.status === "completed" && m.winner_user_id);

  // Carrasco / Freguês — direct wins
  const winsA = completed.filter((m) => m.winner_user_id === playerAId).length;
  const winsB = completed.filter((m) => m.winner_user_id === playerBId).length;

  const carrasco: MedalResult = (() => {
    if (winsA === 0 && winsB === 0) return { holder: null, value: 0, hint: "Sem vitórias ainda" };
    if (winsA === winsB) return { holder: null, value: winsA, hint: `Empate em ${winsA}` };
    return winsA > winsB
      ? { holder: "A", value: winsA, hint: `${winsA} vitórias diretas` }
      : { holder: "B", value: winsB, hint: `${winsB} vitórias diretas` };
  })();

  const fregues: MedalResult = (() => {
    if (winsA === 0 && winsB === 0) return { holder: null, value: 0, hint: "Sem confrontos" };
    if (winsA === winsB) return { holder: null, value: winsA, hint: "Equilíbrio" };
    // The loser is the freguês — opposite of carrasco
    return winsA < winsB
      ? { holder: "A", value: winsB, hint: `${winsB} derrotas diretas` }
      : { holder: "B", value: winsA, hint: `${winsA} derrotas diretas` };
  })();

  // Invicto — longest unbeaten streak (chronologically). Matches assumed newest-first
  // in input; reverse for chronological scan.
  const chronological = [...completed].reverse();
  let curA = 0;
  let curB = 0;
  let maxA = 0;
  let maxB = 0;
  for (const m of chronological) {
    if (m.winner_user_id === playerAId) {
      curA++;
      curB = 0;
      if (curA > maxA) maxA = curA;
    } else if (m.winner_user_id === playerBId) {
      curB++;
      curA = 0;
      if (curB > maxB) maxB = curB;
    }
  }
  const invicto: MedalResult = (() => {
    if (maxA === 0 && maxB === 0) return { holder: null, value: 0, hint: "Sem sequências" };
    if (maxA === maxB) return { holder: null, value: maxA, hint: `Empate em ${maxA}` };
    return maxA > maxB
      ? { holder: "A", value: maxA, hint: `${maxA} vitórias seguidas` }
      : { holder: "B", value: maxB, hint: `${maxB} vitórias seguidas` };
  })();

  // Rei da Virada — won match after losing the first set
  let comebacksA = 0;
  let comebacksB = 0;
  for (const m of completed) {
    if (!m.sets.length || m.sets.length < 2 || !m.team_a_user_id) continue;
    const firstSet = m.sets[0];
    const teamAWonFirst = firstSet.scoreA > firstSet.scoreB;
    const teamBWonFirst = firstSet.scoreB > firstSet.scoreA;
    if (!teamAWonFirst && !teamBWonFirst) continue;

    const playerAIsTeamA = m.team_a_user_id === playerAId;
    const playerALostFirst = playerAIsTeamA ? teamBWonFirst : teamAWonFirst;
    const playerBLostFirst = playerAIsTeamA ? teamAWonFirst : teamBWonFirst;

    if (m.winner_user_id === playerAId && playerALostFirst) comebacksA++;
    if (m.winner_user_id === playerBId && playerBLostFirst) comebacksB++;
  }

  const reiDaVirada: MedalResult = (() => {
    if (comebacksA === 0 && comebacksB === 0) return { holder: null, value: 0, hint: "Nenhuma virada" };
    if (comebacksA === comebacksB) return { holder: null, value: comebacksA, hint: `Empate em ${comebacksA}` };
    return comebacksA > comebacksB
      ? { holder: "A", value: comebacksA, hint: `${comebacksA} viradas` }
      : { holder: "B", value: comebacksB, hint: `${comebacksB} viradas` };
  })();

  // Mestre dos Sets — total sets won across ALL H2H matches (even in losses)
  let setsTotalA = 0;
  let setsTotalB = 0;
  for (const m of completed) {
    if (!m.sets.length || !m.team_a_user_id) continue;
    const playerAIsTeamA = m.team_a_user_id === playerAId;
    for (const s of m.sets) {
      const teamAWon = s.scoreA > s.scoreB;
      const teamBWon = s.scoreB > s.scoreA;
      if (!teamAWon && !teamBWon) continue;
      // Player A won this set?
      const aWonSet = playerAIsTeamA ? teamAWon : teamBWon;
      if (aWonSet) setsTotalA++;
      else setsTotalB++;
    }
  }
  const mestreDosSets: MedalResult = (() => {
    if (setsTotalA === 0 && setsTotalB === 0) return { holder: null, value: 0, hint: "Sem sets jogados" };
    if (setsTotalA === setsTotalB) return { holder: null, value: setsTotalA, hint: `Empate em ${setsTotalA}` };
    return setsTotalA > setsTotalB
      ? { holder: "A", value: setsTotalA, hint: `${setsTotalA} sets vencidos` }
      : { holder: "B", value: setsTotalB, hint: `${setsTotalB} sets vencidos` };
  })();

  // Pé Quente — wins in the last 5 H2H matches (input is newest-first)
  const last5 = completed.slice(0, 5);
  const recentA = last5.filter((m) => m.winner_user_id === playerAId).length;
  const recentB = last5.filter((m) => m.winner_user_id === playerBId).length;
  const peQuente: MedalResult = (() => {
    if (last5.length === 0) return { holder: null, value: 0, hint: "Sem confrontos recentes" };
    if (recentA === recentB) return { holder: null, value: recentA, hint: `Empate em ${recentA} de ${last5.length}` };
    return recentA > recentB
      ? { holder: "A", value: recentA, hint: `${recentA} de ${last5.length} recentes` }
      : { holder: "B", value: recentB, hint: `${recentB} de ${last5.length} recentes` };
  })();

  return { carrasco, invicto, reiDaVirada, fregues, mestreDosSets, peQuente };
}
