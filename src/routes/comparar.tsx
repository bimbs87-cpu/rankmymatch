import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { useMyGroups } from "@/hooks/use-groups";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
}

function CompareLandingPage() {
  const { groups, isLoading: loadingGroups } = useMyGroups();
  const navigate = useNavigate();

  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [activeSeasonId, setActiveSeasonId] = useState<string>("");
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  // Auto-select first group
  useEffect(() => {
    if (!selectedGroupId && groups.length) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  // Load members + ratings for selected group
  useEffect(() => {
    if (!selectedGroupId) {
      setMembers([]);
      setActiveSeasonId("");
      setPicked([]);
      return;
    }
    let cancelled = false;
    setLoadingMembers(true);
    setPicked([]);

    (async () => {
      try {
        // Find latest season
        const { data: seasons } = await supabase
          .from("seasons")
          .select("id, status, created_at")
          .eq("group_id", selectedGroupId)
          .order("created_at", { ascending: false });

        const active = seasons?.find((s) => s.status === "active") || seasons?.[0];
        const sId = active?.id || "";

        // Active members
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
          }
          return;
        }

        const [profilesRes, snapsRes] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("user_id, name, nickname, avatar_url")
            .in("user_id", userIds),
          sId
            ? supabase
                .from("ranking_snapshots")
                .select("user_id, rating")
                .eq("season_id", sId)
                .in("user_id", userIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const ratingMap = new Map<string, number>();
        for (const r of (snapsRes.data as any[]) || []) {
          ratingMap.set(r.user_id, Number(r.rating));
        }

        const list: MemberLite[] = (profilesRes.data || []).map((p: any) => ({
          user_id: p.user_id,
          name: p.name,
          nickname: p.nickname,
          avatar_url: p.avatar_url,
          rating: ratingMap.get(p.user_id) ?? null,
        }));

        list.sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity));

        if (!cancelled) {
          setMembers(list);
          setActiveSeasonId(sId);
        }
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedGroupId]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = (m.nickname || m.name || "").toLowerCase();
      return name.includes(q);
    });
  }, [members, search]);

  const togglePick = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const canCompare = picked.length >= 2;

  const startCompare = () => {
    if (!canCompare || !selectedGroupId) return;
    const [a, b, c, d] = picked;
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

        {/* "Como funciona" — collapsible feel via 3 cards */}
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

        {/* Group selector */}
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
            <section className="mb-4">
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
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {m.rating != null ? `Elo ${Math.round(m.rating)}` : "Sem ranking"}
                          </p>
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
          <Button
            onClick={startCompare}
            disabled={!canCompare}
            size="lg"
            className="w-full rounded-full shadow-lg gap-2"
          >
            {canCompare
              ? `Comparar ${picked.length} jogadores`
              : "Selecione ao menos 2 jogadores"}
            {canCompare && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
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
