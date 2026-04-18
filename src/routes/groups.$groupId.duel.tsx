import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isRivalryGroup } from "@/lib/rivalry";
import { RivalryDuelPage } from "@/components/RivalryDuelPage";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { ArrowLeft, Swords } from "lucide-react";

export const Route = createFileRoute("/groups/$groupId/duel")({
  head: () => ({
    meta: [
      { title: "Duelo — RankMyMatch" },
      { name: "description", content: "Página premium de Head-to-Head do duelo: estatísticas completas, Elo comparativo, retrospecto e dominância." },
    ],
  }),
  component: DuelRoute,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="px-5 py-12 text-center">
        <p className="mb-3 text-sm text-destructive">Erro ao carregar o duelo: {error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="rounded-2xl border border-border bg-card px-4 py-2 text-sm"
        >
          Tentar novamente
        </button>
      </div>
    );
  },
});

function DuelRoute() {
  const { groupId } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<any>(null);
  const [activeSeason, setActiveSeason] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: g }, { data: s }] = await Promise.all([
        supabase.from("groups").select("id, name, match_format, singles_group_type").eq("id", groupId).single(),
        supabase
          .from("seasons")
          .select("id, name")
          .eq("group_id", groupId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!alive) return;
      setGroup(g);
      setActiveSeason(s ? { id: s.id, name: s.name } : null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [groupId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <TrophyLoadingBar />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-sm text-muted-foreground">Grupo não encontrado.</p>
      </div>
    );
  }

  // Defensive: this page is only meaningful for rivalry groups.
  if (!isRivalryGroup(group)) {
    return (
      <div className="px-5 py-12 text-center">
        <Swords className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="mb-4 text-sm text-muted-foreground">
          A página de Duelo é exclusiva para grupos de Rivalidade (Singles 1x1).
        </p>
        <Link
          to="/groups/$groupId"
          params={{ groupId }}
          className="inline-block rounded-2xl border border-border bg-card px-4 py-2 text-sm font-semibold"
        >
          Voltar ao grupo
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-5 py-3">
          <Link
            to="/groups/$groupId"
            params={{ groupId }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Duelo</p>
            <h1 className="truncate font-display text-base font-bold text-foreground">{group.name}</h1>
          </div>
        </div>
      </div>

      <div className="pt-4">
        <RivalryDuelPage
          groupId={groupId}
          groupName={group.name}
          seasonId={activeSeason?.id ?? null}
          seasonName={activeSeason?.name ?? null}
        />
      </div>
    </div>
  );
}
