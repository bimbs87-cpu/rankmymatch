import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  BarChart3,
  Users,
  Search,
  ArrowRight,
  Sparkles,
  Target,
  TrendingUp,
  Lightbulb,
  Trophy,
  Crown,
  ChevronRight,
  Star,
  Heart,
  Flame,
  Snowflake,
  Swords,
  X,
  Check,
  GripVertical,
  Pencil,
  Medal,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { useMyGroups } from "@/hooks/use-groups";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/comparar")({
  component: CompareLandingPage,
  head: () => ({
    meta: [
      { title: "Comparar jogadores — RankMyMatch" },
      {
        name: "description",
        content:
          "Compare jogadores do seu grupo: Elo, aproveitamento, conquistas, sequências e confrontos diretos lado a lado.",
      },
    ],
  }),
});

interface MemberLite {
  user_id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  rating: number | null;
  trend: number | null; // recent rating change
}

interface FavoriteRow {
  id: string;
  label: string;
  group_id: string;
  player_ids: string[];
  sort_order: number;
}

const MAX_FAVORITES = 10;

interface Suggestion {
  key: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  player_ids: string[];
}

function CompareLandingPage() {
  const { groups, isLoading: loadingGroups } = useMyGroups();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [activeSeasonId, setActiveSeasonId] = useState<string>("");
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  // Favorites
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [favLabel, setFavLabel] = useState("");
  const [renameTarget, setRenameTarget] = useState<FavoriteRow | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  // Suggestions
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // Auto-select first group
  useEffect(() => {
    if (!selectedGroupId && groups.length) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  // Load members + ratings + recent trend for selected group
  useEffect(() => {
    if (!selectedGroupId) {
      setMembers([]);
      setActiveSeasonId("");
      setPicked([]);
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoadingMembers(true);
    setPicked([]);

    (async () => {
      try {
        const { data: seasons } = await supabase
          .from("seasons")
          .select("id, status, created_at")
          .eq("group_id", selectedGroupId)
          .order("created_at", { ascending: false });

        const active = seasons?.find((s) => s.status === "active") || seasons?.[0];
        const sId = active?.id || "";

        const { data: gms } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", selectedGroupId)
          .eq("status", "active");

        const userIds = (gms || []).map((m) => m.user_id);
        if (!userIds.length) {
          if (!cancelled) {
            setMembers([]);
            setActiveSeasonId(sId);
            setSuggestions([]);
          }
          return;
        }

        const [profilesRes, snapsRes, statsRes] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("user_id, name, nickname, avatar_url")
            .in("user_id", userIds),
          sId
            ? supabase
                .from("ranking_snapshots")
                .select("user_id, rating, position, matches_played")
                .eq("season_id", sId)
                .in("user_id", userIds)
            : Promise.resolve({ data: [] as any[] }),
          sId
            ? supabase
                .from("player_stats_by_season")
                .select("user_id, matches_played")
                .eq("season_id", sId)
                .in("user_id", userIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const ratingMap = new Map<string, number>();
        for (const r of (snapsRes.data as any[]) || []) {
          ratingMap.set(r.user_id, Number(r.rating));
        }

        const gamesMap = new Map<string, number>();
        for (const r of (statsRes.data as any[]) || []) {
          gamesMap.set(r.user_id, Number(r.matches_played) || 0);
        }
        // Fallback: ranking_snapshots also has matches_played
        for (const r of (snapsRes.data as any[]) || []) {
          if (!gamesMap.has(r.user_id) && r.matches_played != null) {
            gamesMap.set(r.user_id, Number(r.matches_played));
          }
        }

        // Recent trend: sum of last 5 rating_changes per user in current season
        const trendMap = new Map<string, number>();
        if (sId) {
          const { data: events } = await supabase
            .from("rating_events")
            .select("user_id, rating_change, created_at")
            .eq("season_id", sId)
            .in("user_id", userIds)
            .order("created_at", { ascending: false })
            .limit(userIds.length * 5);
          const byUser = new Map<string, number[]>();
          for (const ev of (events as any[]) || []) {
            const arr = byUser.get(ev.user_id) || [];
            if (arr.length < 5) {
              arr.push(Number(ev.rating_change));
              byUser.set(ev.user_id, arr);
            }
          }
          for (const [uid, arr] of byUser) {
            trendMap.set(uid, arr.reduce((s, n) => s + n, 0));
          }
        }

        const list: MemberLite[] = (profilesRes.data || []).map((p: any) => ({
          user_id: p.user_id,
          name: p.name,
          nickname: p.nickname,
          avatar_url: p.avatar_url,
          rating: ratingMap.get(p.user_id) ?? null,
          trend: trendMap.get(p.user_id) ?? null,
        }));

        list.sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity));

        // ---- Build suggestions ----
        const ranked = list.filter((m) => m.rating != null);
        const sug: Suggestion[] = [];

        // Top 1 vs Top 2
        if (ranked.length >= 2) {
          const t1 = ranked[0];
          const t2 = ranked[1];
          sug.push({
            key: "top12",
            title: "Top 1 vs Top 2",
            subtitle: `${displayOf(t1)} vs ${displayOf(t2)}`,
            icon: <Crown className="h-4 w-4 text-primary" />,
            player_ids: [t1.user_id, t2.user_id],
          });
        }

        // Em alta vs Em baixa
        const withTrend = list.filter((m) => m.trend != null && m.trend !== 0);
        if (withTrend.length >= 2) {
          const sortedTrend = [...withTrend].sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0));
          const hot = sortedTrend[0];
          const cold = sortedTrend[sortedTrend.length - 1];
          if (hot.user_id !== cold.user_id && (hot.trend ?? 0) > 0 && (cold.trend ?? 0) < 0) {
            sug.push({
              key: "trend",
              title: "Em alta vs em baixa",
              subtitle: `${displayOf(hot)} (+${Math.round(hot.trend!)}) vs ${displayOf(cold)} (${Math.round(cold.trend!)})`,
              icon: <Flame className="h-4 w-4 text-primary" />,
              player_ids: [hot.user_id, cold.user_id],
            });
          }
        }

        // Maior rivalidade — par com mais confrontos diretos no grupo
        try {
          const { data: gRounds } = await supabase
            .from("rounds")
            .select("id")
            .eq("group_id", selectedGroupId);
          const roundIds = (gRounds || []).map((r) => r.id);
          if (roundIds.length) {
            const { data: gMatches } = await supabase
              .from("matches")
              .select("id, winner_team")
              .in("round_id", roundIds)
              .eq("status", "completed")
              .neq("is_exhibition", true);
            const matchIds = (gMatches || []).map((m) => m.id);
            if (matchIds.length) {
              // Page through match_players (Supabase limits 1000 rows)
              const allMps: { match_id: string; user_id: string; team: string }[] = [];
              const chunk = 200;
              for (let i = 0; i < matchIds.length; i += chunk) {
                const slice = matchIds.slice(i, i + chunk);
                const { data: mps } = await supabase
                  .from("match_players")
                  .select("match_id, user_id, team")
                  .in("match_id", slice);
                if (mps) allMps.push(...(mps as any[]));
              }
              // pair counter for opposing teams
              const pairCount = new Map<string, number>();
              const byMatch = new Map<string, { match_id: string; user_id: string; team: string }[]>();
              for (const mp of allMps) {
                const arr = byMatch.get(mp.match_id) || [];
                arr.push(mp);
                byMatch.set(mp.match_id, arr);
              }
              for (const [, arr] of byMatch) {
                const teamA = arr.filter((p) => p.team === "A").map((p) => p.user_id);
                const teamB = arr.filter((p) => p.team === "B").map((p) => p.user_id);
                for (const a of teamA) {
                  for (const b of teamB) {
                    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
                    pairCount.set(key, (pairCount.get(key) || 0) + 1);
                  }
                }
              }
              if (pairCount.size) {
                let bestKey = "";
                let bestCount = 0;
                for (const [k, c] of pairCount) {
                  if (c > bestCount) {
                    bestCount = c;
                    bestKey = k;
                  }
                }
                if (bestKey && bestCount >= 2) {
                  const [a, b] = bestKey.split("|");
                  const pa = list.find((m) => m.user_id === a);
                  const pb = list.find((m) => m.user_id === b);
                  if (pa && pb) {
                    sug.push({
                      key: "rivalry",
                      title: "Maior rivalidade",
                      subtitle: `${displayOf(pa)} vs ${displayOf(pb)} · ${bestCount} confrontos`,
                      icon: <Swords className="h-4 w-4 text-destructive" />,
                      player_ids: [a, b],
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          // ignore — rivalry is best-effort
          console.warn("rivalry suggestion failed", e);
        }

        // Disputa pelo pódio — 3º vs 4º colocados
        if (ranked.length >= 4) {
          const t3 = ranked[2];
          const t4 = ranked[3];
          const diff = Math.round((t3.rating ?? 0) - (t4.rating ?? 0));
          sug.push({
            key: "podium",
            title: "Disputa pelo pódio",
            subtitle: `${displayOf(t3)} vs ${displayOf(t4)} · ${diff} pts de diferença`,
            icon: <Medal className="h-4 w-4 text-primary" />,
            player_ids: [t3.user_id, t4.user_id],
          });
        }

        // Estreantes em destaque — <10 jogos, maior Elo
        const rookies = ranked.filter((m) => {
          const g = gamesMap.get(m.user_id) ?? 0;
          return g > 0 && g < 10;
        });
        if (rookies.length >= 2) {
          const r1 = rookies[0];
          const r2 = rookies[1];
          sug.push({
            key: "rookies",
            title: "Estreantes em destaque",
            subtitle: `${displayOf(r1)} (${gamesMap.get(r1.user_id)}j) vs ${displayOf(r2)} (${gamesMap.get(r2.user_id)}j)`,
            icon: <Rocket className="h-4 w-4 text-primary" />,
            player_ids: [r1.user_id, r2.user_id],
          });
        }

        if (!cancelled) {
          setMembers(list);
          setActiveSeasonId(sId);
          setSuggestions(sug);
        }
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedGroupId]);

  // Load favorites for current user + group
  const loadFavorites = useCallback(async () => {
    if (!user || !selectedGroupId) {
      setFavorites([]);
      return;
    }
    const { data } = await supabase
      .from("compare_favorites" as any)
      .select("id, label, group_id, player_ids, sort_order")
      .eq("user_id", user.id)
      .eq("group_id", selectedGroupId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    setFavorites((data as any[]) || []);
  }, [user, selectedGroupId]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = (m.nickname || m.name || "").toLowerCase();
      return name.includes(q);
    });
  }, [members, search]);

  const memberMap = useMemo(() => {
    const m = new Map<string, MemberLite>();
    for (const it of members) m.set(it.user_id, it);
    return m;
  }, [members]);

  const togglePick = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const canCompare = picked.length >= 2;

  const goCompare = (ids: string[]) => {
    if (ids.length < 2 || !selectedGroupId) return;
    const [a, b, c, d] = ids;
    navigate({
      to: "/ranking/compare",
      search: {
        a: a || "",
        b: b || "",
        c: c || "",
        d: d || "",
        groupId: selectedGroupId,
        seasonId: activeSeasonId || "",
        tab: "career",
      },
    });
  };

  const startCompare = () => goCompare(picked);

  const compareWithGroupAvg = (userId: string) => {
    if (!selectedGroupId) return;
    navigate({
      to: "/ranking/compare",
      search: {
        a: userId,
        b: "__group_avg__",
        c: "",
        d: "",
        groupId: selectedGroupId,
        seasonId: activeSeasonId || "",
        tab: "career",
      },
    });
  };

  const openSaveFavorite = () => {
    if (!canCompare) return;
    const names = picked
      .map((id) => {
        const m = memberMap.get(id);
        return m ? m.nickname || m.name : "";
      })
      .filter(Boolean);
    setFavLabel(names.join(" vs "));
    setSaveDialogOpen(true);
  };

  const saveFavorite = async () => {
    if (!user || !selectedGroupId || picked.length < 2) return;
    if (favorites.length >= MAX_FAVORITES) {
      toast.error(`Limite de ${MAX_FAVORITES} favoritos por grupo atingido`);
      return;
    }
    const label = favLabel.trim() || "Comparação";
    const nextOrder = favorites.length
      ? Math.max(...favorites.map((f) => f.sort_order ?? 0)) + 1
      : 0;
    const { error } = await supabase.from("compare_favorites" as any).insert({
      user_id: user.id,
      group_id: selectedGroupId,
      label,
      player_ids: picked,
      sort_order: nextOrder,
    });
    if (error) {
      toast.error("Não foi possível salvar o favorito");
      return;
    }
    toast.success("Favorito salvo!");
    setSaveDialogOpen(false);
    loadFavorites();
  };

  const removeFavorite = async (id: string) => {
    const { error } = await supabase.from("compare_favorites" as any).delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover");
      return;
    }
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  };

  const openRename = (fav: FavoriteRow) => {
    setRenameTarget(fav);
    setRenameLabel(fav.label);
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const label = renameLabel.trim();
    if (!label) {
      toast.error("Informe um nome");
      return;
    }
    const { error } = await supabase
      .from("compare_favorites" as any)
      .update({ label })
      .eq("id", renameTarget.id);
    if (error) {
      toast.error("Erro ao renomear");
      return;
    }
    setFavorites((prev) =>
      prev.map((f) => (f.id === renameTarget.id ? { ...f, label } : f)),
    );
    setRenameTarget(null);
  };

  const persistOrder = async (ordered: FavoriteRow[]) => {
    // Optimistic update
    setFavorites(ordered.map((f, i) => ({ ...f, sort_order: i })));
    // Persist sequentially
    for (let i = 0; i < ordered.length; i++) {
      await supabase
        .from("compare_favorites" as any)
        .update({ sort_order: i })
        .eq("id", ordered[i].id);
    }
  };

  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setFavorites((prev) => {
      const fromIdx = prev.findIndex((f) => f.id === dragId);
      const toIdx = prev.findIndex((f) => f.id === overId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };
  const handleDragEnd = () => {
    if (!dragId) return;
    setDragId(null);
    void persistOrder(favorites);
  };

  if (loadingGroups) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <TrophyLoadingBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="mx-auto max-w-5xl px-4 pt-6 lg:pt-8">
        {/* Hero / Intro */}
        <header className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground leading-none">
                Comparar jogadores
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Análise lado a lado de Elo, conquistas e confrontos diretos
              </p>
            </div>
          </div>
        </header>

        {/* "Como funciona" */}
        <section className="mb-6 grid gap-3 md:grid-cols-3">
          <Card className="rounded-2xl border-border bg-card/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-primary">
                  O que é
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Uma ferramenta para colocar <strong className="text-foreground">2 a 4 jogadores</strong>{" "}
                lado a lado e ver, em números, quem está melhor em Elo, vitórias,
                conquistas, sequências e nos confrontos diretos.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-primary">
                  Como usar
                </span>
              </div>
              <ol className="text-xs leading-relaxed text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Escolha o grupo</li>
                <li>Selecione de 2 a 4 jogadores</li>
                <li>Toque em <strong className="text-foreground">Comparar</strong></li>
              </ol>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-primary">
                  Por que usar
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Resolva discussões com dados: descubra quem joga melhor com você,
                quem é seu maior rival e identifique pontos fortes e fracos para
                evoluir.
              </p>
            </CardContent>
          </Card>
        </section>

        {!groups.length ? (
          <Card className="rounded-2xl border-border bg-card">
            <CardContent className="p-8 text-center">
              <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm font-semibold text-foreground mb-1">
                Você ainda não está em nenhum grupo
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Entre em um grupo para começar a comparar jogadores.
              </p>
              <Button asChild>
                <Link to="/groups">Ver grupos</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Group selector */}
            <section className="mb-5">
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">
                1. Escolha o grupo
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {groups.map((g) => {
                  const active = g.id === selectedGroupId;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroupId(g.id)}
                      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-all ${
                        active
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-card/60 text-muted-foreground hover:text-foreground hover:border-foreground/30"
                      }`}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Favorites */}
            {favorites.length > 0 && (
              <section className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Heart className="h-3.5 w-3.5 text-primary fill-primary" />
                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                      Seus favoritos
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {favorites.length}/{MAX_FAVORITES}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Arraste para reordenar · clique no lápis para renomear
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {favorites.map((f) => {
                    const players = f.player_ids
                      .map((id) => memberMap.get(id))
                      .filter(Boolean) as MemberLite[];
                    const isDragging = dragId === f.id;
                    return (
                      <div
                        key={f.id}
                        draggable
                        onDragStart={() => handleDragStart(f.id)}
                        onDragOver={(e) => handleDragOver(e, f.id)}
                        onDragEnd={handleDragEnd}
                        className={`group flex items-center gap-2 rounded-2xl border bg-card/60 p-3 transition-all ${
                          isDragging
                            ? "border-primary opacity-50"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <span
                          className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground"
                          title="Arraste para reordenar"
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <button
                          onClick={() => goCompare(f.player_ids)}
                          className="flex flex-1 items-center gap-3 min-w-0 text-left"
                        >
                          <div className="flex -space-x-2">
                            {players.slice(0, 4).map((p) => (
                              <PlayerAvatar
                                key={p.user_id}
                                avatarUrl={p.avatar_url}
                                name={p.nickname || p.name}
                                size="sm"
                                className="border-2 border-background"
                              />
                            ))}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {f.label}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {players.length} jogadores
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                        </button>
                        <button
                          onClick={() => openRename(f)}
                          className="p-1 text-muted-foreground hover:text-primary transition-colors"
                          title="Renomear"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeFavorite(f.id)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                          title="Remover"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <section className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                    Comparações populares
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {suggestions.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => goCompare(s.player_ids)}
                      className="group flex flex-col gap-2 rounded-2xl border border-border bg-card/60 p-3 text-left hover:border-primary/40 hover:bg-card transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                          {s.icon}
                        </div>
                        <p className="text-xs font-bold text-foreground">{s.title}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug truncate">
                        {s.subtitle}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex -space-x-1.5">
                          {s.player_ids.slice(0, 2).map((id) => {
                            const p = memberMap.get(id);
                            if (!p) return null;
                            return (
                              <PlayerAvatar
                                key={id}
                                avatarUrl={p.avatar_url}
                                name={p.nickname || p.name}
                                size="sm"
                                className="border-2 border-background !h-6 !w-6"
                              />
                            );
                          })}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Player picker */}
            <section className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                  2. Selecione 2 a 4 jogadores
                </p>
                <Badge variant="secondary" className="text-[10px]">
                  {picked.length}/4
                </Badge>
              </div>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar jogador…"
                  className="pl-9 rounded-full bg-card/60"
                />
              </div>

              {loadingMembers ? (
                <div className="py-10 flex justify-center">
                  <TrophyLoadingBar />
                </div>
              ) : filteredMembers.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-6">
                  Nenhum jogador encontrado.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredMembers.map((m) => {
                    const isPicked = picked.includes(m.user_id);
                    const order = picked.indexOf(m.user_id) + 1;
                    const displayName = m.nickname || m.name;
                    const trendIcon =
                      m.trend != null && m.trend > 0 ? (
                        <Flame className="h-3 w-3 text-success" />
                      ) : m.trend != null && m.trend < 0 ? (
                        <Snowflake className="h-3 w-3 text-destructive" />
                      ) : null;
                    return (
                      <button
                        key={m.user_id}
                        onClick={() => togglePick(m.user_id)}
                        className={`group flex items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                          isPicked
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card/60 hover:border-foreground/30"
                        }`}
                      >
                        <div className="relative">
                          <PlayerAvatar
                            avatarUrl={m.avatar_url}
                            name={displayName}
                            size="md"
                          />
                          {isPicked && (
                            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground border-2 border-background">
                              {order}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {displayName}
                          </p>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                            <span>{m.rating != null ? `Elo ${Math.round(m.rating)}` : "Sem ranking"}</span>
                            {trendIcon}
                          </div>
                        </div>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            compareWithGroupAvg(m.user_id);
                          }}
                          role="button"
                          tabIndex={0}
                          className="hidden sm:flex shrink-0 items-center gap-1 rounded-full border border-border bg-background/60 px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                          title="Comparar com a média do grupo"
                        >
                          <Sparkles className="h-3 w-3" /> vs média
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* How to analyse */}
            <section className="mb-6">
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">
                Como analisar os resultados
              </p>
              <Card className="rounded-2xl border-border bg-card/60">
                <CardContent className="p-4 space-y-3">
                  <AnalyseRow
                    icon={<Crown className="h-4 w-4 text-primary" />}
                    title="Elo"
                    desc="Pontuação que mede a força do jogador. Quanto maior, melhor o desempenho."
                  />
                  <AnalyseRow
                    icon={<Target className="h-4 w-4 text-primary" />}
                    title="Aproveitamento"
                    desc="% de vitórias sobre partidas jogadas. Mostra consistência."
                  />
                  <AnalyseRow
                    icon={<Trophy className="h-4 w-4 text-primary" />}
                    title="Conquistas"
                    desc="Títulos e pódios conquistados ao longo das temporadas."
                  />
                  <AnalyseRow
                    icon={<TrendingUp className="h-4 w-4 text-primary" />}
                    title="Confrontos diretos"
                    desc="Quem ganhou mais quando jogaram juntos (parceiros) ou um contra o outro (adversários)."
                  />
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>

      {/* Sticky compare bar */}
      {groups.length > 0 && (
        <div className="fixed bottom-24 lg:bottom-6 left-4 right-4 z-40 mx-auto max-w-md">
          <div className="flex gap-2">
            {canCompare && (
              <Button
                onClick={openSaveFavorite}
                size="lg"
                variant="outline"
                className="rounded-full shadow-lg shrink-0 px-4"
                title="Salvar como favorito"
              >
                <Star className="h-4 w-4" />
              </Button>
            )}
            <Button
              onClick={startCompare}
              disabled={!canCompare}
              size="lg"
              className="flex-1 rounded-full shadow-lg gap-2"
            >
              {canCompare
                ? `Comparar ${picked.length} jogadores`
                : "Selecione ao menos 2 jogadores"}
              {canCompare && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {/* Save favorite dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Salvar favorito</DialogTitle>
            <DialogDescription>
              Dê um nome para acessar essa comparação rapidamente depois.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={favLabel}
              onChange={(e) => setFavLabel(e.target.value)}
              placeholder="Ex: eu vs meu rival"
              maxLength={60}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveFavorite} className="gap-1">
              <Check className="h-4 w-4" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename favorite dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear favorito</DialogTitle>
            <DialogDescription>
              Dê um novo nome para essa comparação.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameLabel}
              onChange={(e) => setRenameLabel(e.target.value)}
              placeholder="Nome do favorito"
              maxLength={60}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmRename} className="gap-1">
              <Check className="h-4 w-4" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function displayOf(m: MemberLite) {
  return m.nickname || m.name;
}

function AnalyseRow({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-foreground leading-tight">{title}</p>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{desc}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 mt-1" />
    </div>
  );
}
