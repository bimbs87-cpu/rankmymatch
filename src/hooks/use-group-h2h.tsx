import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PlayerRivalry {
  user_a: string;
  user_b: string;
  name_a: string;
  name_b: string;
  avatar_a: string | null;
  avatar_b: string | null;
  meetings: number;
  wins_a: number;
  wins_b: number;
  /** Number of matches where they were on the same team (partners). */
  partners: number;
  partners_wins: number;
}

export interface UntappedPair {
  user_a: string;
  user_b: string;
  name_a: string;
  name_b: string;
  avatar_a: string | null;
  avatar_b: string | null;
  /** How many matches each played in the group (sum used as proxy for "active"). */
  activity_a: number;
  activity_b: number;
}

export interface GroupH2HData {
  rivalries: PlayerRivalry[]; // top opponents (different teams)
  partnerships: PlayerRivalry[]; // top partners (same team)
  /** Active players who never faced each other yet, ranked by combined activity. */
  untapped: UntappedPair[];
}

const EMPTY: GroupH2HData = { rivalries: [], partnerships: [], untapped: [] };

export function useGroupH2H(groupId: string | null) {
  const [data, setData] = useState<GroupH2HData>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!groupId) {
      setData(EMPTY);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const { data: rounds } = await supabase
          .from("rounds").select("id").eq("group_id", groupId);
        const roundIds = (rounds || []).map((r) => r.id);
        if (!roundIds.length) {
          if (!cancelled) { setData(EMPTY); setIsLoading(false); }
          return;
        }
        const { data: matches } = await supabase
          .from("matches").select("id, winner_team").in("round_id", roundIds);
        const matchIds = (matches || []).map((m) => m.id);
        if (!matchIds.length) {
          if (!cancelled) { setData(EMPTY); setIsLoading(false); }
          return;
        }
        const winnerMap = new Map((matches || []).map((m) => [m.id, m.winner_team]));
        const { data: mps } = await supabase
          .from("match_players").select("match_id, user_id, team").in("match_id", matchIds);

        const byMatch = new Map<string, { team: string; user_id: string }[]>();
        for (const mp of mps || []) {
          const arr = byMatch.get(mp.match_id) || [];
          arr.push({ team: mp.team, user_id: mp.user_id });
          byMatch.set(mp.match_id, arr);
        }

        // pair key (sorted ids)
        const opp = new Map<string, { a: string; b: string; meetings: number; wins_a: number; wins_b: number }>();
        const part = new Map<string, { a: string; b: string; played: number; wins: number }>();

        for (const [mid, players] of byMatch.entries()) {
          const winner = winnerMap.get(mid);
          const teamA = players.filter((p) => p.team === "a" || p.team === "A").map((p) => p.user_id);
          const teamB = players.filter((p) => p.team === "b" || p.team === "B").map((p) => p.user_id);

          // partnerships: same team
          const recordPartners = (team: string[], won: boolean) => {
            for (let i = 0; i < team.length; i++) {
              for (let j = i + 1; j < team.length; j++) {
                const [a, b] = [team[i], team[j]].sort();
                const k = `${a}::${b}`;
                const cur = part.get(k) || { a, b, played: 0, wins: 0 };
                cur.played += 1; if (won) cur.wins += 1;
                part.set(k, cur);
              }
            }
          };
          recordPartners(teamA, winner === "a" || winner === "A");
          recordPartners(teamB, winner === "b" || winner === "B");

          // opponents: cross teams
          for (const ua of teamA) {
            for (const ub of teamB) {
              const [a, b] = [ua, ub].sort();
              const k = `${a}::${b}`;
              const cur = opp.get(k) || { a, b, meetings: 0, wins_a: 0, wins_b: 0 };
              cur.meetings += 1;
              // wins_a refers to user "a" (sorted)
              if (winner === "a" || winner === "A") {
                if (ua === a) cur.wins_a += 1; else cur.wins_b += 1;
              } else if (winner === "b" || winner === "B") {
                if (ub === a) cur.wins_a += 1; else cur.wins_b += 1;
              }
              opp.set(k, cur);
            }
          }
        }

        const allIds = new Set<string>();
        for (const v of opp.values()) { allIds.add(v.a); allIds.add(v.b); }
        for (const v of part.values()) { allIds.add(v.a); allIds.add(v.b); }
        const idsArr = [...allIds];
        const profileMap = new Map<string, { name: string; nickname: string | null; avatar_url: string | null }>();
        if (idsArr.length) {
          const { data: profs } = await supabase
            .from("user_profiles").select("user_id, name, nickname, avatar_url").in("user_id", idsArr);
          for (const p of profs || []) profileMap.set(p.user_id, { name: p.name, nickname: p.nickname, avatar_url: p.avatar_url });
        }
        const dn = (id: string) => { const p = profileMap.get(id); return p?.nickname || p?.name || "Jogador"; };
        const av = (id: string) => profileMap.get(id)?.avatar_url ?? null;

        // Track partnerships separately so we can attach to rivalries (#times as partners)
        const partLookup = new Map<string, { played: number; wins: number }>();
        for (const v of part.values()) partLookup.set(`${v.a}::${v.b}`, { played: v.played, wins: v.wins });

        const rivalries: PlayerRivalry[] = [...opp.values()]
          .filter((v) => v.meetings >= 2)
          .sort((x, y) => y.meetings - x.meetings)
          .slice(0, 5)
          .map((v) => {
            const partRec = partLookup.get(`${v.a}::${v.b}`);
            return {
              user_a: v.a, user_b: v.b,
              name_a: dn(v.a), name_b: dn(v.b),
              avatar_a: av(v.a), avatar_b: av(v.b),
              meetings: v.meetings, wins_a: v.wins_a, wins_b: v.wins_b,
              partners: partRec?.played ?? 0,
              partners_wins: partRec?.wins ?? 0,
            };
          });

        const partnerships: PlayerRivalry[] = [...part.values()]
          .filter((v) => v.played >= 2)
          .sort((x, y) => y.played - x.played)
          .slice(0, 5)
          .map((v) => ({
            user_a: v.a, user_b: v.b,
            name_a: dn(v.a), name_b: dn(v.b),
            avatar_a: av(v.a), avatar_b: av(v.b),
            meetings: 0, wins_a: 0, wins_b: 0,
            partners: v.played, partners_wins: v.wins,
          }));

        // Untapped pairs: active group members who have NEVER faced each other
        // even though both played at least a few matches in the group.
        const { data: gms } = await supabase
          .from("group_members").select("user_id").eq("group_id", groupId).eq("status", "active");
        const activeIds = (gms || []).map((g) => g.user_id);
        // count matches per user across the group
        const playCount = new Map<string, number>();
        for (const arr of byMatch.values()) {
          for (const p of arr) playCount.set(p.user_id, (playCount.get(p.user_id) || 0) + 1);
        }
        const facedKey = new Set<string>(opp.keys());
        const candidates = activeIds.filter((id) => (playCount.get(id) || 0) >= 3);
        const untapped: UntappedPair[] = [];
        for (let i = 0; i < candidates.length; i++) {
          for (let j = i + 1; j < candidates.length; j++) {
            const [a, b] = [candidates[i], candidates[j]].sort();
            if (facedKey.has(`${a}::${b}`)) continue;
            untapped.push({
              user_a: a, user_b: b,
              name_a: dn(a), name_b: dn(b),
              avatar_a: av(a), avatar_b: av(b),
              activity_a: playCount.get(a) || 0,
              activity_b: playCount.get(b) || 0,
            });
          }
        }
        untapped.sort((x, y) => (y.activity_a + y.activity_b) - (x.activity_a + x.activity_b));

        if (!cancelled) {
          setData({ rivalries, partnerships, untapped: untapped.slice(0, 5) });
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Erro ao carregar h2h:", err);
        if (!cancelled) { setData(EMPTY); setIsLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  return { data, isLoading };
}
