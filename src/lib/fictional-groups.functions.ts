/**
 * Geração e gestão de grupos fictícios para popular a página inicial e o /explore.
 *
 * Estratégia:
 * - Cria 10 grupos PÚBLICOS, cada um com:
 *    - sport (padel/tennis/beach_tennis), match_format (doubles/singles),
 *      member_limit (6/8/10/14/16) coerentes com singles/duplas
 *    - is_fictional = true, requires_approval = true, visibility = 'public'
 *    - 1 admin "fictício" criador (placeholder) marcado como creator
 *    - N membros placeholder (preenchendo o member_limit) com nomes brasileiros
 *      realistas, avatares iniciais e short tagline
 *    - 1 temporada ATIVA (current) com nome "Temporada de YYYY"
 *    - 2-4 rodadas concluídas + 1 rodada futura agendada
 *    - Partidas com sets plausíveis e rating_events aplicando ELO
 *
 * Tudo é idempotente por grupo via marker "is_fictional = true". Permite
 * regenerar o lote inteiro (drop + recreate) e excluir grupos individuais.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAppAdmin(userId: string) {
  if (!userId) throw new Error("Forbidden");
  const { data, error } = await supabaseAdmin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden");
}

// ----- Catálogos brasileiros -----------------------------------------------
const FIRST_NAMES = [
  "João","Lucas","Pedro","Gustavo","Rafael","Mateus","Bruno","Felipe","Thiago",
  "Henrique","Diego","Vinicius","Marcelo","André","Rodrigo","Caio","Eduardo",
  "Ricardo","Daniel","Gabriel","Igor","Leonardo","Fernando","Murilo","Otávio",
  "Renato","Sérgio","Vitor","Arthur","Bernardo","Davi","Enzo","Heitor","Miguel",
  "Nicolas","Theo","Yuri","Alex","Bryan","Cauã","Erick","Fábio","Gean","Hugo",
  "Ian","Jonas","Kauê","Lipe","Marcos","Nuno","Osvaldo","Paulo","Quirino",
  "Rômulo","Saulo","Tales","Ulisses","Valdir","Wesley","Xavier","Yago","Zé",
  "Ana","Bia","Carla","Duda","Elisa","Fernanda","Giovanna","Helena","Isabela",
  "Júlia","Karen","Larissa","Manuela","Natália","Olívia","Paula","Renata","Sofia",
  "Tatiana","Valentina"
];
const LAST_NAMES = [
  "Silva","Santos","Oliveira","Souza","Lima","Pereira","Almeida","Costa","Ferreira",
  "Rodrigues","Carvalho","Gomes","Ribeiro","Martins","Barbosa","Nunes","Teixeira",
  "Cardoso","Moraes","Pinto","Cavalcante","Dias","Castro","Mendes","Araújo",
  "Vieira","Moreira","Correia","Rocha","Freitas","Barros","Batista","Caldas",
  "Duarte","Ramos","Tavares","Vasconcelos","Xavier","Zanetti","Andrade"
];

const SPORTS = ["padel", "tennis", "beach_tennis"] as const;
const MEMBER_LIMITS = [6, 8, 10, 14, 16] as const;

type GroupBlueprint = {
  name: string;
  description: string;
  sport: (typeof SPORTS)[number];
  match_format: "doubles" | "singles";
  singles_group_type: string | null;
  member_limit: number;
  fixed_day: number; // 0..6
};

function toSeasonMatchFormat(matchFormat: string) {
  return matchFormat === "singles" || matchFormat === "1v1" ? "1v1" : "2v2";
}

// Pool de imagens "realistas" por esporte (Unsplash, sem hotlink restrito)
// Parecem fotos tiradas por integrantes do grupo — quadras, jogadores, ambiente.
const SPORT_IMAGES: Record<(typeof SPORTS)[number], string[]> = {
  padel: [
    "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1591491653056-4e0f7a8a7a48?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=800&q=80&auto=format&fit=crop",
  ],
  tennis: [
    "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1542144582-1ba00456b5e3?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1591491634026-77cd95c0aa5e?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1560012754-0d3a31a7c50c?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1530915365347-e35b749a0381?w=800&q=80&auto=format&fit=crop",
  ],
  beach_tennis: [
    "https://images.unsplash.com/photo-1531315396756-905d68d21b56?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1599050751795-6cdaafbc2319?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1519861531473-9200262188bf?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1530870110042-98b2cb110834?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1592656094267-764a45160876?w=800&q=80&auto=format&fit=crop",
  ],
};

const BLUEPRINTS: GroupBlueprint[] = [
  {
    name: "Padel das Quintas SP",
    description: "Duplas amistosas todas as quintas — Pinheiros, SP.",
    sport: "padel",
    match_format: "doubles",
    singles_group_type: null,
    member_limit: 16,
    fixed_day: 4,
  },
  {
    name: "Tênis Vila Mariana",
    description: "",
    sport: "tennis",
    match_format: "doubles",
    singles_group_type: null,
    member_limit: 14,
    fixed_day: 6,
  },
  {
    name: "Beach Tennis Itaguá",
    description: "Beach Tennis na praia do Itaguá, Ubatuba. Duplas mistas.",
    sport: "beach_tennis",
    match_format: "doubles",
    singles_group_type: null,
    member_limit: 10,
    fixed_day: 0,
  },
  {
    name: "Tênis Singles Moema",
    description: "",
    sport: "tennis",
    match_format: "singles",
    singles_group_type: "tournament",
    member_limit: 8,
    fixed_day: 6,
  },
  {
    name: "Padel Pro Itaim",
    description: "Padel competitivo no Itaim — duplas fixas + ranking.",
    sport: "padel",
    match_format: "doubles",
    singles_group_type: null,
    member_limit: 16,
    fixed_day: 2,
  },
  {
    name: "Beach Tennis Barra",
    description: "",
    sport: "beach_tennis",
    match_format: "doubles",
    singles_group_type: null,
    member_limit: 14,
    fixed_day: 5,
  },
  {
    name: "Tênis Duelos Curitiba",
    description: "Duelos 1x1 entre os tenistas de Curitiba.",
    sport: "tennis",
    match_format: "singles",
    singles_group_type: "rivalry",
    member_limit: 6,
    fixed_day: 3,
  },
  {
    name: "Padel Belo Horizonte",
    description: "",
    sport: "padel",
    match_format: "doubles",
    singles_group_type: null,
    member_limit: 10,
    fixed_day: 0,
  },
  {
    name: "Beach Tennis Floripa",
    description: "Beach na Praia Mole — Florianópolis. Verão o ano todo.",
    sport: "beach_tennis",
    match_format: "doubles",
    singles_group_type: null,
    member_limit: 8,
    fixed_day: 6,
  },
  {
    name: "Padel Iniciantes Brasília",
    description: "",
    sport: "padel",
    match_format: "doubles",
    singles_group_type: null,
    member_limit: 8,
    fixed_day: 1,
  },
];

// ----- Helpers --------------------------------------------------------------
function randUuid(): string {
  // Edge runtime tem crypto.randomUUID
  return crypto.randomUUID();
}
function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function genFullName(used: Set<string>, rng: () => number): string {
  for (let i = 0; i < 200; i++) {
    const name = `${pick(FIRST_NAMES, rng)} ${pick(LAST_NAMES, rng)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  return `${pick(FIRST_NAMES, rng)} ${pick(LAST_NAMES, rng)} ${Math.floor(rng() * 99)}`;
}

// Apelidos curtos, no estilo de quem realmente cadastrou conta
const NICKNAME_POOL = [
  "Tuca", "Rafa", "Gugu", "Léo", "Bia", "Dudu", "Caco", "Lipe", "Téo", "Nico",
  "Guto", "Vini", "Bruno", "Kiko", "Zé", "Pedrão", "Mati", "Pipo", "Chico",
  "Dani", "Mari", "Cami", "Lulu", "Rê", "Babi", "Ju", "Lia", "Manu", "Ale",
  "Tiba", "Rod", "Fê", "Henri", "Dé", "Cacá", "Tom", "Edu", "Vitão", "Felps",
];
function genNickname(name: string, used: Set<string>, rng: () => number): string {
  const first = name.split(" ")[0] ?? "";
  const candidates = [
    pick(NICKNAME_POOL, rng),
    first.slice(0, 4),
    `${first.slice(0, 3)}${Math.floor(rng() * 99)}`,
    `${first.toLowerCase()}.${pick(["br","sp","rj","mg"], rng)}`,
  ];
  for (const c of candidates) {
    const v = c.replace(/\s+/g, "").slice(0, 16);
    if (v && !used.has(v.toLowerCase())) {
      used.add(v.toLowerCase());
      return v;
    }
  }
  return `${first}${Math.floor(rng() * 999)}`;
}
// DiceBear (sem chave) — gera avatar consistente por seed; parece "real"
function genDicebearUrl(seed: string, rng: () => number): string {
  const styles = ["avataaars", "personas", "lorelei", "notionists", "adventurer"];
  const style = pick(styles, rng);
  const safeSeed = encodeURIComponent(seed);
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${safeSeed}`;
}

// Pequena ELO pra evolução plausível
function applyElo(
  ratingA: number,
  ratingB: number,
  winnerIsA: boolean,
  k = 32
): { newA: number; newB: number; deltaA: number } {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const scoreA = winnerIsA ? 1 : 0;
  const deltaA = Math.round(k * (scoreA - expectedA));
  return { newA: ratingA + deltaA, newB: ratingB - deltaA, deltaA };
}

// ----- LIST -----------------------------------------------------------------
export const listFictionalGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAppAdmin(context.userId);
    const { data: groups, error } = await supabaseAdmin
      .from("groups")
      .select(
        "id, name, sport, match_format, singles_group_type, member_limit, public_code, visibility, created_at"
      )
      .eq("is_fictional", true)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (groups ?? []).map((g) => g.id);
    const memberCounts: Record<string, number> = {};
    const finishedSeasonCounts: Record<string, number> = {};
    const activeSeasonByGroup: Record<string, { id: string; name: string }> = {};
    const activeRoundCounts: Record<string, number> = {};
    if (ids.length) {
      const [{ data: gm }, { data: ss }] = await Promise.all([
        supabaseAdmin.from("group_members").select("group_id").in("group_id", ids).eq("status", "active"),
        supabaseAdmin.from("seasons").select("id, group_id, status, name, created_at").in("group_id", ids).order("created_at", { ascending: false }),
      ]);
      for (const r of gm ?? []) memberCounts[r.group_id] = (memberCounts[r.group_id] ?? 0) + 1;
      for (const s of ss ?? []) {
        if (s.status === "finished") {
          finishedSeasonCounts[s.group_id] = (finishedSeasonCounts[s.group_id] ?? 0) + 1;
        } else if (s.status === "active" && !activeSeasonByGroup[s.group_id]) {
          activeSeasonByGroup[s.group_id] = { id: s.id, name: s.name };
        }
      }
      const activeSeasonIds = Object.values(activeSeasonByGroup).map((s) => s.id);
      if (activeSeasonIds.length) {
        const { data: rs } = await supabaseAdmin
          .from("rounds")
          .select("group_id, season_id, status")
          .in("season_id", activeSeasonIds)
          .eq("status", "completed");
        for (const r of rs ?? []) activeRoundCounts[r.group_id] = (activeRoundCounts[r.group_id] ?? 0) + 1;
      }
    }

    return {
      groups: (groups ?? []).map((g) => ({
        ...g,
        memberCount: memberCounts[g.id] ?? 0,
        activeSeasonName: activeSeasonByGroup[g.id]?.name ?? null,
        activeSeasonRounds: activeRoundCounts[g.id] ?? 0,
        finishedSeasonsCount: finishedSeasonCounts[g.id] ?? 0,
      })),
    };
  });

// ----- DELETE ALL -----------------------------------------------------------
async function deleteInChunks(
  table: string,
  column: string,
  ids: string[],
  extraEq?: { col: string; val: string | number | boolean }
) {
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabaseAdmin.from(table as never).delete().in(column, slice);
    if (extraEq) q = q.eq(extraEq.col, extraEq.val);
    const { error } = await q;
    if (error) console.error(`[fictional] delete ${table} chunk failed`, error.message);
  }
}

async function deleteFictionalCascade(): Promise<{ deletedGroups: number }> {
  const { data: groups } = await supabaseAdmin
    .from("groups")
    .select("id")
    .eq("is_fictional", true);
  const groupIds = (groups ?? []).map((g) => g.id);
  if (!groupIds.length) return { deletedGroups: 0 };

  // Coleta IDs em cadeia
  const { data: rounds } = await supabaseAdmin
    .from("rounds").select("id, season_id").in("group_id", groupIds);
  const roundIds = (rounds ?? []).map((r) => r.id);
  const seasonIdsSet = new Set<string>();
  for (const r of rounds ?? []) if (r.season_id) seasonIdsSet.add(r.season_id);

  // Coleta matches em chunks (round_ids podem ser muitos)
  const matchIds: string[] = [];
  const RCHUNK = 200;
  for (let i = 0; i < roundIds.length; i += RCHUNK) {
    const slice = roundIds.slice(i, i + RCHUNK);
    const { data: m } = await supabaseAdmin.from("matches").select("id").in("round_id", slice);
    if (m) matchIds.push(...m.map((x) => x.id));
  }

  // Coleta placeholder users desses grupos pra remover perfis depois
  const { data: members } = await supabaseAdmin
    .from("group_members").select("user_id").in("group_id", groupIds);
  const memberUserIds = Array.from(new Set((members ?? []).map((m) => m.user_id)));

  // Cascade delete (ordem importa: filhos antes dos pais)
  if (matchIds.length) {
    await deleteInChunks("match_sets", "match_id", matchIds);
    await deleteInChunks("match_players", "match_id", matchIds);
    await deleteInChunks("rating_events", "match_id", matchIds);
    await deleteInChunks("matches", "id", matchIds);
  }
  if (roundIds.length) {
    await deleteInChunks("courts", "round_id", roundIds);
    await deleteInChunks("round_presence", "round_id", roundIds);
    await deleteInChunks("rounds", "id", roundIds);
  }
  const seasonIds = Array.from(seasonIdsSet);
  if (seasonIds.length) {
    await deleteInChunks("ranking_snapshots", "season_id", seasonIds);
    await deleteInChunks("player_stats_by_season", "season_id", seasonIds);
    await deleteInChunks("seasons", "id", seasonIds);
  }
  await deleteInChunks("group_members", "group_id", groupIds);
  await deleteInChunks("groups", "id", groupIds);

  // Remove perfis fictícios restantes (todos têm created_by_admin setado)
  if (memberUserIds.length) {
    const PCHUNK = 200;
    for (let i = 0; i < memberUserIds.length; i += PCHUNK) {
      const slice = memberUserIds.slice(i, i + PCHUNK);
      const { error } = await supabaseAdmin
        .from("user_profiles")
        .delete()
        .in("user_id", slice)
        .not("created_by_admin", "is", null);
      if (error) console.error("[fictional] delete user_profiles chunk failed", error.message);
    }
  }

  return { deletedGroups: groupIds.length };
}

export const deleteAllFictionalGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAppAdmin(context.userId);
    return deleteFictionalCascade();
  });

export const deleteFictionalGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { groupId: string }) => data)
  .handler(async ({ context, data }) => {
    await ensureAppAdmin(context.userId);

    // Verificação dura: só apaga se for fictício
    const { data: g } = await supabaseAdmin
      .from("groups").select("id, is_fictional").eq("id", data.groupId).maybeSingle();
    if (!g || !g.is_fictional) throw new Error("Group is not fictional");

    // Reusa lógica em escopo de 1 grupo
    const groupIds = [data.groupId];
    const { data: rounds } = await supabaseAdmin
      .from("rounds").select("id, season_id").in("group_id", groupIds);
    const roundIds = (rounds ?? []).map((r) => r.id);
    const seasonIdsSet = new Set<string>();
    for (const r of rounds ?? []) if (r.season_id) seasonIdsSet.add(r.season_id);
    const { data: matches } = roundIds.length
      ? await supabaseAdmin.from("matches").select("id").in("round_id", roundIds)
      : { data: [] as { id: string }[] };
    const matchIds = (matches ?? []).map((m) => m.id);
    const { data: members } = await supabaseAdmin
      .from("group_members").select("user_id").in("group_id", groupIds);
    const memberUserIds = Array.from(new Set((members ?? []).map((m) => m.user_id)));

    if (matchIds.length) {
      await supabaseAdmin.from("match_sets").delete().in("match_id", matchIds);
      await supabaseAdmin.from("match_players").delete().in("match_id", matchIds);
      await supabaseAdmin.from("rating_events").delete().in("match_id", matchIds);
      await supabaseAdmin.from("matches").delete().in("id", matchIds);
    }
    if (roundIds.length) {
      await supabaseAdmin.from("courts").delete().in("round_id", roundIds);
      await supabaseAdmin.from("round_presence").delete().in("round_id", roundIds);
      await supabaseAdmin.from("rounds").delete().in("id", roundIds);
    }
    const seasonIds = Array.from(seasonIdsSet);
    if (seasonIds.length) {
      await supabaseAdmin.from("ranking_snapshots").delete().in("season_id", seasonIds);
      await supabaseAdmin.from("player_stats_by_season").delete().in("season_id", seasonIds);
      await supabaseAdmin.from("seasons").delete().in("id", seasonIds);
    }
    await supabaseAdmin.from("group_members").delete().in("group_id", groupIds);
    await supabaseAdmin.from("groups").delete().in("id", groupIds);
    if (memberUserIds.length) {
      await supabaseAdmin
        .from("user_profiles")
        .delete()
        .in("user_id", memberUserIds)
        .not("created_by_admin", "is", null);
    }

    return { ok: true };
  });

// ----- BUILD: cria 1 grupo fictício -----------------------------------------
const MAX_ROUNDS = 15;

function clampRoundsCount(n: number | undefined, fallback: number) {
  const v = Math.floor(Number(n ?? fallback));
  if (!Number.isFinite(v) || v < 1) return 1;
  if (v > MAX_ROUNDS) return MAX_ROUNDS;
  return v;
}

type SimContext = {
  groupId: string;
  seasonId: string;
  matchFormat: "doubles" | "singles";
  memberLimit: number;
  playerIds: string[];
  ratings: Record<string, number>;
};

async function simulateOneRound(
  ctx: SimContext,
  roundNumber: number,
  scheduledDate: string,
  rng: () => number
) {
  const isSingles = ctx.matchFormat === "singles";
  const { data: roundIns, error: roundErr } = await supabaseAdmin
    .from("rounds").insert({
      group_id: ctx.groupId,
      season_id: ctx.seasonId,
      round_number: roundNumber,
      match_format: ctx.matchFormat,
      max_players: ctx.memberLimit,
      scheduled_date: scheduledDate,
      scheduled_time: "19:00:00",
      status: "completed",
    }).select("id").single();
  if (roundErr || !roundIns) throw new Error(`round: ${roundErr?.message}`);
  const roundId = roundIns.id;

  const { data: courtIns } = await supabaseAdmin
    .from("courts").insert({ round_id: roundId, court_number: 1, name: "Quadra 1" })
    .select("id").single();
  const courtId = courtIns?.id ?? null;

  const shuffled = shuffle(ctx.playerIds, rng);
  const groupSize = isSingles ? 2 : 4;
  const numMatches = Math.floor(shuffled.length / groupSize);

  for (let m = 0; m < numMatches; m++) {
    const slice = shuffled.slice(m * groupSize, (m + 1) * groupSize);
    const teamA = isSingles ? [slice[0]] : [slice[0], slice[1]];
    const teamB = isSingles ? [slice[1]] : [slice[2], slice[3]];

    const avgA = teamA.reduce((s, u) => s + ctx.ratings[u], 0) / teamA.length;
    const avgB = teamB.reduce((s, u) => s + ctx.ratings[u], 0) / teamB.length;
    const expectedA = 1 / (1 + Math.pow(10, (avgB - avgA) / 400));
    const winnerIsA = rng() < expectedA;
    const winnerTeam = winnerIsA ? "A" : "B";

    const { data: matchIns, error: matchErr } = await supabaseAdmin
      .from("matches").insert({
        round_id: roundId,
        court_id: courtId,
        match_format: ctx.matchFormat,
        match_number: m + 1,
        status: "completed",
        winner_team: winnerTeam,
        counts_for_ranking: true,
        result_type: "normal",
      }).select("id").single();
    if (matchErr || !matchIns) throw new Error(`match: ${matchErr?.message}`);
    const matchId = matchIns.id;

    await supabaseAdmin.from("match_players").insert([
      ...teamA.map((u) => ({ match_id: matchId, user_id: u, team: "A" })),
      ...teamB.map((u) => ({ match_id: matchId, user_id: u, team: "B" })),
    ]);

    // Sets — best of 3
    const setRows: { match_id: string; set_number: number; score_team_a: number; score_team_b: number; is_tiebreak: boolean }[] = [];
    let setsA = 0, setsB = 0, setNum = 1;
    while (setsA < 2 && setsB < 2) {
      const aWinsSet = winnerIsA ? rng() > 0.25 : rng() < 0.25;
      const winScore = 6;
      const loseScore = Math.floor(rng() * 5);
      setRows.push({
        match_id: matchId,
        set_number: setNum,
        score_team_a: aWinsSet ? winScore : loseScore,
        score_team_b: aWinsSet ? loseScore : winScore,
        is_tiebreak: false,
      });
      if (aWinsSet) setsA++; else setsB++;
      setNum++;
    }
    await supabaseAdmin.from("match_sets").insert(setRows);

    // Rating events (snapshot pré-delta antes de mutar)
    const allUsers = [...teamA, ...teamB];
    const preRatings: Record<string, number> = {};
    for (const u of allUsers) preRatings[u] = ctx.ratings[u];

    const rEvents = allUsers.map((u) => {
      const onTeamA = teamA.includes(u);
      const opponents = onTeamA ? teamB : teamA;
      const myRating = preRatings[u];
      const oppAvg = opponents.reduce((s, x) => s + preRatings[x], 0) / opponents.length;
      const expected = 1 / (1 + Math.pow(10, (oppAvg - myRating) / 400));
      const won = (onTeamA && winnerIsA) || (!onTeamA && !winnerIsA);
      const score = won ? 1 : 0;
      const k = 32;
      const delta = Math.round(k * (score - expected));
      ctx.ratings[u] = myRating + delta;
      return {
        match_id: matchId,
        user_id: u,
        season_id: ctx.seasonId,
        rating_before: myRating,
        rating_after: myRating + delta,
        rating_change: delta,
        k_factor: k,
        match_format: ctx.matchFormat,
        actual_score: score,
        expected_score: Number(expected.toFixed(4)),
      };
    });
    await supabaseAdmin.from("rating_events").insert(rEvents);
  }

  return { roundId, matches: numMatches };
}

async function buildOneFictionalGroup(
  blueprint: GroupBlueprint,
  rng: () => number,
  callerUserId: string,
  roundsCount: number
) {
  const usedNames = new Set<string>();
  const completedCount = clampRoundsCount(roundsCount, 8);

  // 1) Cria perfis fictícios — ~60% aparentam ter conta vinculada
  //    (nickname + avatar), ~40% ficam como placeholders ("Sem conta")
  const totalPlayers = blueprint.member_limit;
  const usedNicks = new Set<string>();
  const linkedCount = Math.max(
    Math.ceil(totalPlayers * 0.6),
    Math.min(totalPlayers, 1),
  );
  const linkedFlags = shuffle(
    Array.from({ length: totalPlayers }, (_, i) => i < linkedCount),
    rng,
  );
  const profileRows: {
    user_id: string;
    name: string;
    nickname: string | null;
    avatar_url: string | null;
    avatar_type: string | null;
    is_placeholder: boolean;
    created_by_admin: string;
  }[] = [];
  for (let i = 0; i < totalPlayers; i++) {
    const fullName = genFullName(usedNames, rng);
    const linked = linkedFlags[i];
    profileRows.push({
      user_id: randUuid(),
      name: fullName,
      nickname: linked ? genNickname(fullName, usedNicks, rng) : null,
      avatar_url: linked ? genDicebearUrl(fullName, rng) : null,
      avatar_type: linked ? "preset" : null,
      is_placeholder: !linked,
      created_by_admin: callerUserId,
    });
  }
  const { error: profErr } = await supabaseAdmin.from("user_profiles").insert(profileRows);
  if (profErr) throw new Error(`profiles: ${profErr.message}`);

  // 2) Cria o grupo (com foto aleatória do esporte)
  const sportImages = SPORT_IMAGES[blueprint.sport] ?? [];
  const imageUrl = sportImages.length > 0 ? pick(sportImages, rng) : null;
  const { data: groupInsert, error: groupErr } = await supabaseAdmin
    .from("groups")
    .insert({
      name: blueprint.name,
      description: blueprint.description,
      image_url: imageUrl,
      sport: blueprint.sport,
      match_format: blueprint.match_format,
      singles_group_type: blueprint.singles_group_type,
      member_limit: blueprint.member_limit,
      max_players: blueprint.member_limit,
      slots_per_round: blueprint.match_format === "singles" ? 2 : 4,
      simultaneous_courts: 1,
      fixed_day: blueprint.fixed_day,
      visibility: "public",
      is_public: true,
      is_fictional: true,
      requires_approval: true,
      mode: "free",
      status: "active",
      presence_open_mode: "1_day_before",
      presence_open_time: "10:00:00",
      created_by: callerUserId,
      public_code: "",
    })
    .select("id")
    .single();
  if (groupErr || !groupInsert) throw new Error(`group: ${groupErr?.message}`);
  const groupId = groupInsert.id;

  // 3) Membros — primeiro placeholder = creator
  const memberRows = profileRows.map((p, idx) => ({
    group_id: groupId,
    user_id: p.user_id,
    role: idx === 0 ? "creator" : "member",
    status: "active",
  }));
  const { error: memErr } = await supabaseAdmin.from("group_members").insert(memberRows);
  if (memErr) throw new Error(`members: ${memErr.message}`);

  // 4) Temporada ativa — começa antes da primeira rodada agendada
  const today = new Date();
  const startDate = new Date(today.getTime() - (completedCount * 7 + 7) * 24 * 3600_000)
    .toISOString().slice(0, 10);
  const { data: seasonInsert, error: seasonErr } = await supabaseAdmin
    .from("seasons")
    .insert({
      group_id: groupId,
      name: `Temporada ${today.getFullYear()}`,
      status: "active",
      match_format: toSeasonMatchFormat(blueprint.match_format),
      sets_mode: "fixed",
      sets_per_match: 3,
      duration_type: "3_months",
      start_date: startDate,
      created_by: callerUserId,
    })
    .select("id")
    .single();
  if (seasonErr || !seasonInsert) throw new Error(`season: ${seasonErr?.message}`);
  const seasonId = seasonInsert.id;

  // 5) Ratings em memória
  const ratings: Record<string, number> = {};
  for (const p of profileRows) ratings[p.user_id] = 1000;

  const ctx: SimContext = {
    groupId,
    seasonId,
    matchFormat: blueprint.match_format,
    memberLimit: blueprint.member_limit,
    playerIds: profileRows.map((p) => p.user_id),
    ratings,
  };

  // 6) Simula N rodadas concluídas (uma por semana retroativa)
  for (let r = 0; r < completedCount; r++) {
    const daysAgo = (completedCount - r) * 7;
    const dt = new Date(today.getTime() - daysAgo * 24 * 3600_000);
    await simulateOneRound(ctx, r + 1, dt.toISOString().slice(0, 10), rng);
  }

  // 7) Próxima rodada agendada
  const futureDt = new Date(today.getTime() + 7 * 24 * 3600_000);
  await supabaseAdmin.from("rounds").insert({
    group_id: groupId,
    season_id: seasonId,
    round_number: completedCount + 1,
    match_format: blueprint.match_format,
    max_players: blueprint.member_limit,
    scheduled_date: futureDt.toISOString().slice(0, 10),
    scheduled_time: "19:00:00",
    status: "scheduled",
  });

  return { groupId, completedRounds: completedCount };
}

// ----- GENERATE -------------------------------------------------------------
// Total de blueprints disponíveis (lido pelo cliente para iterar).
export const getFictionalPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAppAdmin(context.userId);
    return { total: BLUEPRINTS.length, names: BLUEPRINTS.map((b) => b.name) };
  });

// Cria UM grupo fictício por chamada, evitando timeout.
export const generateOneFictionalGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { index: number; seed?: number; roundsCount?: number; wipeFirst?: boolean }) => data
  )
  .handler(async ({ context, data }) => {
    await ensureAppAdmin(context.userId);
    if (data.wipeFirst && data.index === 0) {
      await deleteFictionalCascade();
    }
    const bp = BLUEPRINTS[data.index];
    if (!bp) throw new Error(`Invalid blueprint index ${data.index}`);

    // Idempotência: pula se já existe grupo fictício com o mesmo nome
    const { data: existing } = await supabaseAdmin
      .from("groups")
      .select("id")
      .eq("name", bp.name)
      .eq("is_fictional", true)
      .maybeSingle();
    if (existing) {
      return { groupId: existing.id, name: bp.name, skipped: true, index: data.index };
    }

    const seed = (data.seed ?? Date.now() & 0x7fffffff) + data.index * 7919;
    const rng = mulberry32(seed);
    const roundsCount = clampRoundsCount(data.roundsCount, 8);

    const { groupId } = await buildOneFictionalGroup(bp, rng, context.userId, roundsCount);
    return { groupId, name: bp.name, skipped: false, index: data.index };
  });

// ----- SIMULATE NEW ROUND(S) ------------------------------------------------
export const simulateRoundForFictional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { groupId: string; roundsCount?: number }) => data)
  .handler(async ({ context, data }) => {
    await ensureAppAdmin(context.userId);
    const { data: g } = await supabaseAdmin
      .from("groups")
      .select("id, is_fictional, match_format, member_limit")
      .eq("id", data.groupId)
      .maybeSingle();
    if (!g || !g.is_fictional) throw new Error("Group is not fictional");

    let { data: season } = await supabaseAdmin
      .from("seasons")
      .select("id")
      .eq("group_id", g.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!season) {
      const today = new Date();
      const { data: createdSeason, error: seasonErr } = await supabaseAdmin
        .from("seasons")
        .insert({
          group_id: g.id,
          name: `Temporada ${today.getFullYear()}`,
          status: "active",
          match_format: toSeasonMatchFormat(g.match_format),
          sets_mode: "fixed",
          sets_per_match: 3,
          duration_type: "3_months",
          start_date: today.toISOString().slice(0, 10),
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (seasonErr || !createdSeason) {
        throw new Error(`Could not create active season: ${seasonErr?.message ?? "unknown error"}`);
      }
      season = createdSeason;
    }

    const { data: members } = await supabaseAdmin
      .from("group_members").select("user_id").eq("group_id", g.id).eq("status", "active");
    const playerIds = (members ?? []).map((m) => m.user_id);

    // Reconstrói ratings atuais a partir do último rating_after por user
    const { data: lastEvents } = await supabaseAdmin
      .from("rating_events").select("user_id, rating_after, created_at")
      .eq("season_id", season.id).order("created_at", { ascending: true });
    const ratings: Record<string, number> = {};
    for (const u of playerIds) ratings[u] = 1000;
    for (const e of lastEvents ?? []) ratings[e.user_id] = e.rating_after;

    // Próximo número de rodada (considera apenas rodadas concluídas)
    const { data: lastRound } = await supabaseAdmin
      .from("rounds").select("round_number").eq("group_id", g.id)
      .eq("status", "completed")
      .order("round_number", { ascending: false }).limit(1).maybeSingle();
    let nextNum = (lastRound?.round_number ?? 0) + 1;

    const ctx: SimContext = {
      groupId: g.id,
      seasonId: season.id,
      matchFormat: g.match_format === "singles" ? "singles" : "doubles",
      memberLimit: g.member_limit ?? playerIds.length,
      playerIds,
      ratings,
    };

    const rng = mulberry32(Date.now() & 0x7fffffff);
    const roundsToSim = clampRoundsCount(data.roundsCount, 1);
    const today = new Date();
    let totalMatches = 0;
    const firstRound = nextNum;

    for (let i = 0; i < roundsToSim; i++) {
      const dt = new Date(today.getTime() - (roundsToSim - 1 - i) * 24 * 3600_000);
      const { matches } = await simulateOneRound(ctx, nextNum, dt.toISOString().slice(0, 10), rng);
      totalMatches += matches;
      nextNum++;
    }

    return {
      ok: true,
      roundsSimulated: roundsToSim,
      firstRound,
      lastRound: nextNum - 1,
      matches: totalMatches,
      roundNumber: nextNum - 1,
    };
  });

// ----- START NEW SEASON -----------------------------------------------------
export const startNewSeasonForFictional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { groupId: string; name?: string }) => data)
  .handler(async ({ context, data }) => {
    await ensureAppAdmin(context.userId);
    const { data: g } = await supabaseAdmin
      .from("groups")
      .select("id, is_fictional, match_format")
      .eq("id", data.groupId)
      .maybeSingle();
    if (!g || !g.is_fictional) throw new Error("Group is not fictional");

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    // Encerra todas as temporadas ativas
    await supabaseAdmin
      .from("seasons")
      .update({ status: "finished", end_date: todayIso })
      .eq("group_id", g.id)
      .eq("status", "active");

    // Cria nova temporada ativa
    const { data: created, error: seasonErr } = await supabaseAdmin
      .from("seasons")
      .insert({
        group_id: g.id,
        name: data.name?.trim() || `Temporada ${today.getFullYear()} #${Math.floor(today.getTime() / 1000) % 1000}`,
        status: "active",
        match_format: toSeasonMatchFormat(g.match_format),
        sets_mode: "fixed",
        sets_per_match: 3,
        duration_type: "3_months",
        start_date: todayIso,
        created_by: context.userId,
      })
      .select("id, name")
      .single();
    if (seasonErr || !created) throw new Error(`season: ${seasonErr?.message}`);

    return { ok: true, seasonId: created.id, seasonName: created.name };
  });
