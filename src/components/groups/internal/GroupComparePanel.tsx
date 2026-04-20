import { useEffect, useMemo, useState, useCallback } from "react";
import {
  BarChart3, Search, ArrowRight, Sparkles, Crown, Flame, Snowflake,
  Swords, X, Heart, GripVertical, Pencil, Medal, Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface MemberLite {
  user_id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  rating: number | null;
  trend: number | null;
}

interface FavoriteRow {
  id: string;
  label: string;
  group_id: string;
  player_ids: string[];
  sort_order: number;
}

interface Suggestion {
  key: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  player_ids: string[];
}

const MAX_FAVORITES = 10;

const displayOf = (m: MemberLite) => m.nickname || m.name;

interface PanelProps {
  groupId: string;
  /** Pre-selected pair to open the embedded compare automatically. */
  initialPick?: string[] | null;
  /** Called once the parent-provided initialPick has been consumed. */
  onConsumeInitial?: () => void;
}

export function GroupComparePanel({ groupId, initialPick, onConsumeInitial }: PanelProps) {
  const { user } = useAuth();

  const [activeSeasonId, setActiveSeasonId] = useState("");
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [favLabel, setFavLabel] = useState("");
  const [renameTarget, setRenameTarget] = useState<FavoriteRow | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  // (No more embedded iframe — clicking compare navigates to the full-screen
  // compare page with a backTo param so the user can return to this panel.)

  useEffect(() => {
    let cancelled = false;
    setLoadingMembers(true);
    setPicked([]);

    (async () => {
      try {
        const { data: seasons } = await supabase
          .from("seasons")
          .select("id, status, created_at")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false });

        const active = seasons?.find((s) => s.status === "active") || seasons?.[0];
        const sId = active?.id || "";

        const { data: gms } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", groupId)
          .eq("status", "active");

        const userIds = (gms || []).map((m) => m.user_id);
        if (!userIds.length) {
          if (!cancelled) {
            setMembers([]); setActiveSeasonId(sId); setSuggestions([]);
          }
          return;
        }

        const [profilesRes, snapsRes, statsRes] = await Promise.all([
          supabase.from("user_profiles")
            .select("user_id, name, nickname, avatar_url").in("user_id", userIds),
          sId
            ? supabase.from("ranking_snapshots")
                .select("user_id, rating, position, matches_played")
                .eq("season_id", sId).in("user_id", userIds)
            : Promise.resolve({ data: [] as any[] }),
          sId
            ? supabase.from("player_stats_by_season")
                .select("user_id, matches_played")
                .eq("season_id", sId).in("user_id", userIds)
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
        for (const r of (snapsRes.data as any[]) || []) {
          if (!gamesMap.has(r.user_id) && r.matches_played != null) {
            gamesMap.set(r.user_id, Number(r.matches_played));
          }
        }

        // Recent trend (last 5 events in current season)
        const trendMap = new Map<string, number>();
        if (sId) {
          const { data: events } = await supabase
            .from("rating_events")
            .select("user_id, rating_change, created_at")
            .eq("season_id", sId).in("user_id", userIds)
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

        // Suggestions
        const ranked = list.filter((m) => m.rating != null);
        const sug: Suggestion[] = [];
        if (ranked.length >= 2) {
          const t1 = ranked[0]; const t2 = ranked[1];
          sug.push({
            key: "top12", title: "Top 1 vs Top 2",
            subtitle: `${displayOf(t1)} vs ${displayOf(t2)}`,
            icon: <Crown className="h-4 w-4 text-primary" />,
            player_ids: [t1.user_id, t2.user_id],
          });
        }
        const withTrend = list.filter((m) => m.trend != null && m.trend !== 0);
        if (withTrend.length >= 2) {
          const sorted = [...withTrend].sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0));
          const hot = sorted[0]; const cold = sorted[sorted.length - 1];
          if (hot.user_id !== cold.user_id && (hot.trend ?? 0) > 0 && (cold.trend ?? 0) < 0) {
            sug.push({
              key: "trend", title: "Em alta vs em baixa",
              subtitle: `${displayOf(hot)} (+${Math.round(hot.trend!)}) vs ${displayOf(cold)} (${Math.round(cold.trend!)})`,
              icon: <Flame className="h-4 w-4 text-primary" />,
              player_ids: [hot.user_id, cold.user_id],
            });
          }
        }
        if (ranked.length >= 4) {
          const t3 = ranked[2]; const t4 = ranked[3];
          const diff = Math.round((t3.rating ?? 0) - (t4.rating ?? 0));
          sug.push({
            key: "podium", title: "Disputa pelo 3º",
            subtitle: `${displayOf(t3)} vs ${displayOf(t4)} · ${diff} pts`,
            icon: <Medal className="h-4 w-4 text-primary" />,
            player_ids: [t3.user_id, t4.user_id],
          });
        }
        const rookies = ranked.filter((m) => {
          const g = gamesMap.get(m.user_id) ?? 0;
          return g > 0 && g < 10;
        });
        if (rookies.length >= 2) {
          const r1 = rookies[0]; const r2 = rookies[1];
          sug.push({
            key: "rookies", title: "Estreantes em destaque",
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
    return () => { cancelled = true; };
  }, [groupId]);

  const loadFavorites = useCallback(async () => {
    if (!user) { setFavorites([]); return; }
    const { data } = await supabase
      .from("compare_favorites" as any)
      .select("id, label, group_id, player_ids, sort_order")
      .eq("user_id", user.id).eq("group_id", groupId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    setFavorites((data as any[]) || []);
  }, [user, groupId]);

  useEffect(() => { loadFavorites(); }, [loadFavorites]);

  const buildCompareUrl = useCallback((ids: string[], opts: { withBack?: boolean } = {}) => {
    const [a, b, c, d] = ids;
    const params = new URLSearchParams({
      a: a || "", b: b || "", c: c || "", d: d || "",
      groupId, seasonId: activeSeasonId || "", tab: "career",
    });
    if (opts.withBack) {
      params.set("backTo", `/groups/${groupId}?view=compare`);
    }
    return `/ranking/compare?${params.toString()}`;
  }, [groupId, activeSeasonId]);

  const openCompare = useCallback((ids: string[]) => {
    if (ids.length < 2) return;
    // Full-page navigation so the heavy compare route mounts cleanly with auth
    // intact. The compare page renders a "Voltar" button that returns here.
    window.location.assign(buildCompareUrl(ids, { withBack: true }));
  }, [buildCompareUrl]);

  // Auto-open the compare page when a parent passes initialPick (e.g. user
  // clicks a rivalry/partnership/untapped card on the Overview).
  useEffect(() => {
    if (!initialPick || initialPick.length < 2) return;
    if (loadingMembers) return;
    const ids = initialPick.slice(0, 4);
    onConsumeInitial?.();
    openCompare(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPick, loadingMembers, members]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => (m.nickname || m.name || "").toLowerCase().includes(q));
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

  const goCompare = (ids: string[]) => openCompare(ids);

  const compareWithGroupAvg = (userId: string) => {
    openCompare([userId, "__group_avg__"]);
  };

  const openSaveFavorite = () => {
    if (!canCompare) return;
    const names = picked.map((id) => {
      const m = memberMap.get(id);
      return m ? m.nickname || m.name : "";
    }).filter(Boolean);
    setFavLabel(names.join(" vs "));
    setSaveDialogOpen(true);
  };

  const saveFavorite = async () => {
    if (!user || picked.length < 2) return;
    if (favorites.length >= MAX_FAVORITES) {
      toast.error(`Limite de ${MAX_FAVORITES} favoritos por grupo atingido`);
      return;
    }
    const label = favLabel.trim() || "Comparação";
    const nextOrder = favorites.length
      ? Math.max(...favorites.map((f) => f.sort_order ?? 0)) + 1 : 0;
    const { error } = await supabase.from("compare_favorites" as any).insert({
      user_id: user.id, group_id: groupId, label,
      player_ids: picked, sort_order: nextOrder,
    });
    if (error) { toast.error("Não foi possível salvar"); return; }
    toast.success("Favorito salvo!");
    setSaveDialogOpen(false);
    loadFavorites();
  };

  const removeFavorite = async (id: string) => {
    const { error } = await supabase.from("compare_favorites" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao remover"); return; }
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  };

  const openRename = (fav: FavoriteRow) => {
    setRenameTarget(fav); setRenameLabel(fav.label);
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const label = renameLabel.trim();
    if (!label) { toast.error("Informe um nome"); return; }
    const { error } = await supabase
      .from("compare_favorites" as any).update({ label }).eq("id", renameTarget.id);
    if (error) { toast.error("Erro ao renomear"); return; }
    setFavorites((prev) => prev.map((f) => (f.id === renameTarget.id ? { ...f, label } : f)));
    setRenameTarget(null);
  };

  const persistOrder = async (ordered: FavoriteRow[]) => {
    setFavorites(ordered.map((f, i) => ({ ...f, sort_order: i })));
    for (let i = 0; i < ordered.length; i++) {
      await supabase.from("compare_favorites" as any).update({ sort_order: i }).eq("id", ordered[i].id);
    }
  };

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

  // (No more inline iframe view — openCompare() does a full-page navigation.)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-foreground leading-none">
            Comparar jogadores
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Selecione 2 a 4 membros do grupo · resultado abre em nova aba
          </p>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <section className="order-2 lg:order-none">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Sugestões
          </p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {suggestions.map((s) => (
              <button
                key={s.key}
                onClick={() => goCompare(s.player_ids)}
                className="group flex flex-col gap-1.5 rounded-2xl border border-border bg-card/60 p-2.5 text-left hover:border-primary/40 hover:bg-card transition-all"
              >
                <div className="flex items-center gap-1.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    {s.icon}
                  </div>
                  <p className="text-[11px] font-bold text-foreground leading-tight line-clamp-1 flex-1">{s.title}</p>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2 min-h-[2.2em]">{s.subtitle}</p>
                <div className="flex items-center justify-between">
                  <div className="flex -space-x-1.5">
                    {s.player_ids.slice(0, 2).map((id) => {
                      const p = memberMap.get(id);
                      if (!p) return null;
                      return (
                        <PlayerAvatar key={id} avatarUrl={p.avatar_url} name={p.nickname || p.name}
                          size="sm" className="border-2 border-background !h-5 !w-5" />
                      );
                    })}
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Favorites */}
      {favorites.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Heart className="h-3.5 w-3.5 text-primary fill-primary" />
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Favoritos</p>
            </div>
            <Badge variant="secondary" className="text-[10px] tabular-nums">{favorites.length}/{MAX_FAVORITES}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {favorites.map((f) => {
              const players = f.player_ids.map((id) => memberMap.get(id)).filter(Boolean) as MemberLite[];
              const isDragging = dragId === f.id;
              return (
                <div
                  key={f.id}
                  draggable
                  onDragStart={() => setDragId(f.id)}
                  onDragOver={(e) => handleDragOver(e, f.id)}
                  onDragEnd={handleDragEnd}
                  className={`group flex items-center gap-2 rounded-2xl border bg-card/60 p-3 transition-all ${
                    isDragging ? "border-primary opacity-50" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="cursor-grab active:cursor-grabbing text-muted-foreground/60">
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <button onClick={() => goCompare(f.player_ids)} className="flex flex-1 items-center gap-3 min-w-0 text-left">
                    <div className="flex -space-x-2">
                      {players.slice(0, 4).map((p) => (
                        <PlayerAvatar key={p.user_id} avatarUrl={p.avatar_url} name={p.nickname || p.name}
                          size="sm" className="border-2 border-background" />
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{f.label}</p>
                      <p className="text-[10px] text-muted-foreground">{players.length} jogadores</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                  </button>
                  <button onClick={() => openRename(f)} className="p-1 text-muted-foreground hover:text-primary" title="Renomear">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => removeFavorite(f.id)} className="p-1 text-muted-foreground hover:text-destructive" title="Remover">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Picker */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            Selecione 2 a 4 jogadores
          </p>
          <Badge variant="secondary" className="text-[10px]">{picked.length}/4</Badge>
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

        {loadingMembers && members.length === 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[64px] rounded-2xl border border-border bg-card/40 animate-pulse" />
            ))}
          </div>
        ) : filteredMembers.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-6">Nenhum jogador encontrado.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {filteredMembers.map((m) => {
              const isPicked = picked.includes(m.user_id);
              const order = picked.indexOf(m.user_id) + 1;
              const displayName = m.nickname || m.name;
              const trendIcon =
                m.trend != null && m.trend > 0 ? <Flame className="h-3 w-3 text-success" /> :
                m.trend != null && m.trend < 0 ? <Snowflake className="h-3 w-3 text-destructive" /> : null;
              return (
                <button
                  key={m.user_id}
                  onClick={() => togglePick(m.user_id)}
                  className={`group flex items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                    isPicked ? "border-primary bg-primary/10" : "border-border bg-card/60 hover:border-foreground/30"
                  }`}
                >
                  <div className="relative">
                    <PlayerAvatar avatarUrl={m.avatar_url} name={displayName} size="md" />
                    {isPicked && (
                      <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground border-2 border-background">
                        {order}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                      <span>{m.rating != null ? `Elo ${Math.round(m.rating)}` : "Sem ranking"}</span>
                      {trendIcon}
                    </div>
                  </div>
                  <span
                    onClick={(e) => { e.stopPropagation(); compareWithGroupAvg(m.user_id); }}
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

      {/* Sticky CTA */}
      {picked.length > 0 && (
        <div className="sticky bottom-4 z-10">
          <div className="flex items-center gap-2 rounded-2xl border border-primary/40 bg-card/95 p-3 shadow-xl backdrop-blur">
            <div className="flex -space-x-2 flex-1 min-w-0">
              {picked.map((id) => {
                const p = memberMap.get(id);
                if (!p) return null;
                return (
                  <PlayerAvatar key={id} avatarUrl={p.avatar_url} name={p.nickname || p.name}
                    size="sm" className="border-2 border-background" />
                );
              })}
              <span className="ml-3 self-center text-xs font-semibold text-foreground">
                {picked.length} {picked.length === 1 ? "selecionado" : "selecionados"}
              </span>
            </div>
            <button
              onClick={openSaveFavorite}
              disabled={!canCompare}
              className="rounded-full border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Salvar como favorito"
            >
              <Heart className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => goCompare(picked)}
              disabled={!canCompare}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              Comparar <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Save dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar favorito</DialogTitle>
            <DialogDescription>Escolha um nome para identificar essa comparação.</DialogDescription>
          </DialogHeader>
          <Input value={favLabel} onChange={(e) => setFavLabel(e.target.value)} placeholder="Ex: Top 4" />
          <DialogFooter>
            <button onClick={() => setSaveDialogOpen(false)} className="rounded-full px-3 py-2 text-xs text-muted-foreground">
              Cancelar
            </button>
            <button onClick={saveFavorite} className="rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
              Salvar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear favorito</DialogTitle>
          </DialogHeader>
          <Input value={renameLabel} onChange={(e) => setRenameLabel(e.target.value)} />
          <DialogFooter>
            <button onClick={() => setRenameTarget(null)} className="rounded-full px-3 py-2 text-xs text-muted-foreground">
              Cancelar
            </button>
            <button onClick={confirmRename} className="rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
              Salvar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
