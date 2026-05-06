import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { ArrowLeft, Plus, Trophy, Users, Calendar, MapPin, Trash2, Loader2, BarChart3, User, Target, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CasualMatchDialog } from "@/components/CasualMatchDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/partidas-avulsas")({
  head: () => ({
    meta: [{ title: "Partidas Avulsas — RankMyMatch" }],
  }),
  component: CasualMatchesPage,
});

interface CasualMatchRow {
  id: string;
  match_format: string;
  played_on: string;
  played_at_time: string | null;
  location: string | null;
  winner_team: string | null;
  participants: { team: string; display_name: string; is_owner: boolean; contact_id: string | null }[];
  sets: { set_number: number; score_team_a: number; score_team_b: number }[];
}

function CasualMatchesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<CasualMatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: m } = await supabase
        .from("casual_matches")
        .select("id, match_format, played_on, played_at_time, location, winner_team")
        .eq("owner_user_id", user.id)
        .order("played_on", { ascending: false })
        .limit(200);
      const ids = (m || []).map((x) => x.id);
      if (ids.length === 0) {
        if (!cancelled) {
          setMatches([]);
          setLoading(false);
        }
        return;
      }
      const [{ data: parts }, { data: setsData }] = await Promise.all([
        supabase.from("casual_match_participants").select("match_id, team, display_name, is_owner, contact_id").in("match_id", ids),
        supabase.from("casual_match_sets").select("match_id, set_number, score_team_a, score_team_b").in("match_id", ids),
      ]);
      if (cancelled) return;
      const rows: CasualMatchRow[] = (m || []).map((row) => ({
        ...row,
        participants: (parts || []).filter((p) => (p as any).match_id === row.id),
        sets: (setsData || [])
          .filter((s) => (s as any).match_id === row.id)
          .sort((a: any, b: any) => a.set_number - b.set_number),
      }));
      setMatches(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, reloadKey]);

  const stats = useMemo(() => {
    const total = matches.length;
    let wins = 0;
    let setsWon = 0;
    let setsLost = 0;
    const partnerCount = new Map<string, { count: number; wins: number }>();
    const opponentCount = new Map<string, { count: number; wins: number }>();
    const locations = new Map<string, number>();

    for (const m of matches) {
      const owner = m.participants.find((p) => p.is_owner);
      const myTeam = owner?.team || "a";
      const won = m.winner_team === myTeam;
      if (won) wins++;
      for (const s of m.sets) {
        if (myTeam === "a") {
          setsWon += s.score_team_a > s.score_team_b ? 1 : 0;
          setsLost += s.score_team_b > s.score_team_a ? 1 : 0;
        } else {
          setsWon += s.score_team_b > s.score_team_a ? 1 : 0;
          setsLost += s.score_team_a > s.score_team_b ? 1 : 0;
        }
      }
      for (const p of m.participants) {
        if (p.is_owner) continue;
        const key = p.display_name;
        const map = p.team === myTeam ? partnerCount : opponentCount;
        const cur = map.get(key) || { count: 0, wins: 0 };
        cur.count++;
        if (won) cur.wins++;
        map.set(key, cur);
      }
      if (m.location) {
        locations.set(m.location, (locations.get(m.location) || 0) + 1);
      }
    }
    const losses = total - wins;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const topPartners = Array.from(partnerCount.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    const topOpponents = Array.from(opponentCount.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    const topLocations = Array.from(locations.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { total, wins, losses, winRate, setsWon, setsLost, topPartners, topOpponents, topLocations };
  }, [matches]);

  const handleDelete = async (id: string) => {
    if (!confirm("Apagar esta partida?")) return;
    const { error } = await supabase.from("casual_matches").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Partida apagada");
      setReloadKey((k) => k + 1);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/" className="rounded-lg p-1.5 hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="font-display text-base font-bold">Partidas Avulsas</h1>
            <p className="text-[10px] text-muted-foreground">Jogos-treino e partidas fora dos seus grupos</p>
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Nova
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {/* Stats overview */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Trophy className="h-4 w-4" />} label="Partidas" value={stats.total} />
          <StatCard icon={<Award className="h-4 w-4 text-success" />} label="Vitórias" value={`${stats.wins} (${stats.winRate}%)`} />
          <StatCard icon={<Target className="h-4 w-4" />} label="Derrotas" value={stats.losses} />
          <StatCard icon={<BarChart3 className="h-4 w-4" />} label="Sets" value={`${stats.setsWon}-${stats.setsLost}`} />
        </section>

        {/* Top partners / opponents */}
        {(stats.topPartners.length > 0 || stats.topOpponents.length > 0) && (
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <RankList title="Parceiros frequentes" data={stats.topPartners} accent="text-primary" />
            <RankList title="Adversários frequentes" data={stats.topOpponents} accent="text-destructive" />
          </section>
        )}

        {stats.topLocations.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Locais</p>
            <div className="flex flex-wrap gap-2">
              {stats.topLocations.map(([loc, n]) => (
                <span key={loc} className="rounded-full bg-muted px-3 py-1 text-xs">
                  <MapPin className="mr-1 inline h-3 w-3" /> {loc} <span className="text-muted-foreground">×{n}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* History */}
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Histórico</h2>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : matches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
              <Trophy className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-muted-foreground">Nenhuma partida avulsa ainda</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Registre seu primeiro jogo-treino para começar.</p>
              <button
                onClick={() => setDialogOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                <Plus className="h-4 w-4" /> Registrar partida
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {matches.map((m) => (
                <MatchCard key={m.id} match={m} onDelete={() => handleDelete(m.id)} />
              ))}
            </div>
          )}
        </section>
      </main>

      <CasualMatchDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={() => setReloadKey((k) => k + 1)} />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div>
      <p className="font-display text-lg font-bold">{value}</p>
    </div>
  );
}

function RankList({ title, data, accent }: { title: string; data: [string, { count: number; wins: number }][]; accent: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1">
          {data.map(([name, s]) => (
            <li key={name} className="flex items-center gap-2 text-xs">
              <User className={`h-3 w-3 ${accent}`} />
              <span className="flex-1 truncate font-medium">{name}</span>
              <span className="text-muted-foreground">{s.count}j · {s.wins}v</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchCard({ match, onDelete }: { match: CasualMatchRow; onDelete: () => void }) {
  const owner = match.participants.find((p) => p.is_owner);
  const myTeam = owner?.team || "a";
  const myMates = match.participants.filter((p) => p.team === myTeam && !p.is_owner);
  const opponents = match.participants.filter((p) => p.team !== myTeam);
  const won = match.winner_team === myTeam;
  const score = match.sets.map((s) => `${s.score_team_a}/${s.score_team_b}`).join("  ");
  const dateLabel = new Date(match.played_on + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return (
    <div className={`rounded-2xl border p-3 ${won ? "border-success/30 bg-success/5" : match.winner_team ? "border-destructive/20 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="flex items-start gap-2">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${won ? "bg-success/20 text-success" : match.winner_team ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"}`}>
          <Trophy className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground">
            <span className="capitalize">{dateLabel}</span>
            <span>·</span>
            <span>{match.match_format === "singles" ? "1x1" : "2x2"}</span>
            {match.location && (<><span>·</span><span className="truncate"><MapPin className="mr-0.5 inline h-2.5 w-2.5" />{match.location}</span></>)}
          </div>
          <p className="mt-0.5 truncate text-sm font-semibold">
            {[owner?.display_name, ...myMates.map((m) => m.display_name)].filter(Boolean).join(" + ")}
            <span className="mx-1.5 text-muted-foreground">vs</span>
            {opponents.map((o) => o.display_name).join(" + ")}
          </p>
          {score && <p className="mt-1 font-mono text-xs font-bold tracking-wider">{score}</p>}
        </div>
        <button onClick={onDelete} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
