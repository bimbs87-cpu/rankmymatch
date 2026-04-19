import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { ProfileBody } from "@/components/ProfileBody";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import {
  loadAggregatedProfile,
  loadAggregatedSummary,
  loadEloHistory,
  type AggregatedProfile,
  type AggregatedSummary,
} from "@/lib/aggregated-profile";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/players/$userId")({
  head: ({ params }) => {
    const ogImage = `/api/og/player/${params.userId}`;
    return {
      meta: [
        { title: "Perfil do jogador — RankMyMatch" },
        { name: "description", content: "Veja o perfil competitivo de um jogador no RankMyMatch." },
        { property: "og:title", content: "Perfil competitivo no RankMyMatch" },
        { property: "og:description", content: "Veja Elo, melhor posição e estatísticas deste jogador." },
        { property: "og:image", content: ogImage },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: ogImage },
      ],
    };
  },
  component: PlayerPublicProfile,
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-background px-5 pb-28 pt-10 text-center">
      <p className="text-sm text-muted-foreground">Não foi possível carregar este perfil.</p>
      <p className="mt-2 text-xs text-muted-foreground/70">{error?.message}</p>
      <Link to="/" className="mt-4 inline-block text-xs font-semibold text-primary">Voltar ao início</Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-background px-5 pt-10 text-center">
      <p className="text-sm text-muted-foreground">Jogador não encontrado.</p>
      <Link to="/" className="mt-4 inline-block text-xs font-semibold text-primary">Voltar ao início</Link>
    </div>
  ),
});

function PlayerPublicProfile() {
  const { userId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AggregatedProfile | null>(null);
  const [summary, setSummary] = useState<AggregatedSummary | null>(null);
  const [eloHistory, setEloHistory] = useState<{ date: string; rating: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id === userId) {
      navigate({ to: "/profile", replace: true });
    }
  }, [user?.id, userId, navigate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [p, s, h] = await Promise.all([
        loadAggregatedProfile(userId),
        loadAggregatedSummary(userId),
        loadEloHistory(userId),
      ]);
      if (cancelled) return;
      setProfile(p);
      setSummary(s);
      setEloHistory(h);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <TrophyLoadingBar />;

  if (!profile || !summary) {
    return (
      <div className="min-h-screen bg-background px-5 pt-10 text-center">
        <p className="text-sm text-muted-foreground">Jogador não encontrado.</p>
        <Link to="/" className="mt-4 inline-block text-xs font-semibold text-primary">
          Voltar ao início
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="flex items-center gap-3 px-5 pt-6 pb-2">
        <button
          onClick={() => window.history.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <h1 className="flex-1 font-display text-lg font-bold text-foreground">Perfil</h1>
        <ShareProfileButton userId={userId} playerName={profile.name || "jogador"} />
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Lock className="h-3 w-3" /> Público
        </span>
      </header>
      <ProfileBody
        profile={profile}
        summary={summary}
        eloHistory={eloHistory}
        viewerId={user?.id ?? null}
      />
    </div>
  );
}
