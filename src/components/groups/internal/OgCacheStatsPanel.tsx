/**
 * Painel de estatísticas do cache da OG (últimos 7 dias).
 * Visível apenas para criadores de algum grupo.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOgCacheStats, type OgCacheStats } from "@/lib/og-cache.functions";
import { BarChart3, Loader2, TrendingUp, Users } from "lucide-react";

export function OgCacheStatsPanel() {
  const fetchStats = useServerFn(getOgCacheStats);
  const [stats, setStats] = useState<OgCacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchStats();
        if (!cancelled) setStats(res);
      } catch (e) {
        if (!cancelled) setError("Falha ao carregar estatísticas");
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-border bg-card p-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando estatísticas…
      </div>
    );
  }
  if (error || !stats) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
        {error || "Sem dados disponíveis."}
      </div>
    );
  }

  const total = stats.totalHit + stats.totalMiss;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="font-display text-base font-bold text-foreground">Cache de cards de compartilhamento</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Estatísticas dos últimos {stats.windowDays} dias. Quanto maior o hit-rate, mais barata e
          rápida fica a renderização.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="HIT" value={stats.totalHit.toLocaleString("pt-BR")} tone="primary" />
        <Stat label="MISS" value={stats.totalMiss.toLocaleString("pt-BR")} tone="warn" />
        <Stat
          label="Hit-rate"
          value={total > 0 ? `${stats.hitRatePct}%` : "—"}
          tone={stats.hitRatePct >= 70 ? "primary" : stats.hitRatePct >= 40 ? "neutral" : "warn"}
          icon={<TrendingUp className="h-3 w-3" />}
        />
      </div>

      <div className="rounded-3xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Top 10 jogadores mais compartilhados
          </h4>
        </div>
        {stats.topPlayers.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma renderização nos últimos 7 dias.</p>
        ) : (
          <ol className="space-y-1.5">
            {stats.topPlayers.map((p, idx) => (
              <li
                key={p.user_id}
                className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">
                    {idx + 1}.
                  </span>
                  <span className="truncate font-medium text-foreground">{p.name}</span>
                </span>
                <span className="font-mono text-xs font-bold text-primary">
                  {p.renders.toLocaleString("pt-BR")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "primary" | "warn" | "neutral";
  icon?: React.ReactNode;
}) {
  const cls =
    tone === "primary"
      ? "text-primary"
      : tone === "warn"
        ? "text-amber-500"
        : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1 font-display text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}
