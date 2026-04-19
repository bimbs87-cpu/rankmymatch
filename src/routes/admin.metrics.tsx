import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAdminPendingCount } from "@/hooks/use-admin-pending-count";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";

export const Route = createFileRoute("/admin/metrics")({
  head: () => ({
    meta: [
      { title: "Métricas do admin — RankMyMatch" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminMetricsPage,
});

const CRITICAL_MS = 7 * 24 * 60 * 60 * 1000;

interface GroupMetric {
  groupId: string;
  groupName: string;
  approved: number;
  rejected: number;
  pending: number;
  critical: number;
  avgResponseMs: number | null;
  total: number;
}

function fmtDuration(ms: number | null): string {
  if (ms === null || !isFinite(ms)) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}

function AdminMetricsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { adminGroupIds } = useAdminPendingCount();

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<GroupMetric[]>([]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate({ to: "/login" });
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    const load = async () => {
      if (!user || !adminGroupIds.length) {
        setMetrics([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const cutoff = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString();

        const [reqsRes, claimsRes, groupsRes] = await Promise.all([
          supabase
            .from("group_join_requests")
            .select("group_id, status, created_at, resolved_at")
            .in("group_id", adminGroupIds)
            .gte("created_at", cutoff),
          supabase
            .from("player_claims")
            .select("group_id, status, created_at, resolved_at")
            .in("group_id", adminGroupIds)
            .gte("created_at", cutoff),
          supabase.from("groups").select("id, name").in("id", adminGroupIds),
        ]);

        const groupNames = new Map(
          (groupsRes.data || []).map((g) => [g.id, g.name as string]),
        );
        const all = [...(reqsRes.data || []), ...(claimsRes.data || [])];

        const map = new Map<string, GroupMetric>();
        for (const id of adminGroupIds) {
          map.set(id, {
            groupId: id,
            groupName: groupNames.get(id) || "Grupo",
            approved: 0,
            rejected: 0,
            pending: 0,
            critical: 0,
            avgResponseMs: null,
            total: 0,
          });
        }
        const responseTimes = new Map<string, number[]>();

        for (const r of all) {
          const m = map.get(r.group_id);
          if (!m) continue;
          m.total++;
          if (r.status === "approved") m.approved++;
          else if (r.status === "rejected") m.rejected++;
          else if (r.status === "pending") {
            m.pending++;
            const age = Date.now() - new Date(r.created_at).getTime();
            if (age >= CRITICAL_MS) m.critical++;
          }
          if (r.resolved_at) {
            const dt =
              new Date(r.resolved_at).getTime() -
              new Date(r.created_at).getTime();
            if (dt >= 0) {
              const arr = responseTimes.get(r.group_id) || [];
              arr.push(dt);
              responseTimes.set(r.group_id, arr);
            }
          }
        }

        for (const [gid, arr] of responseTimes.entries()) {
          const m = map.get(gid);
          if (m && arr.length) {
            m.avgResponseMs = arr.reduce((s, v) => s + v, 0) / arr.length;
          }
        }

        setMetrics(
          [...map.values()].sort((a, b) => b.total - a.total),
        );
      } catch (err) {
        console.error("Erro ao carregar métricas:", err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user?.id, adminGroupIds.join(",")]);

  const totals = useMemo(() => {
    const t = {
      approved: 0,
      rejected: 0,
      pending: 0,
      critical: 0,
      total: 0,
      avgMs: 0,
      avgCount: 0,
    };
    for (const m of metrics) {
      t.approved += m.approved;
      t.rejected += m.rejected;
      t.pending += m.pending;
      t.critical += m.critical;
      t.total += m.total;
      if (m.avgResponseMs !== null) {
        t.avgMs += m.avgResponseMs * (m.approved + m.rejected);
        t.avgCount += m.approved + m.rejected;
      }
    }
    const overallAvg = t.avgCount > 0 ? t.avgMs / t.avgCount : null;
    const approvalRate =
      t.approved + t.rejected > 0
        ? (t.approved / (t.approved + t.rejected)) * 100
        : null;
    const criticalRate =
      t.total > 0 ? (t.critical / t.total) * 100 : 0;
    return { ...t, overallAvg, approvalRate, criticalRate };
  }, [metrics]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-32 lg:pb-12">
        <TrophyLoadingBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32 lg:pb-12">
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link
            to="/admin/inbox"
            className="rounded-full border border-border bg-card p-2 text-muted-foreground hover:text-foreground"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="font-display text-xl font-bold text-foreground">
            Métricas do admin
          </h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            últimos 30 dias
          </span>
        </div>

        {metrics.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-10 text-center">
            <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-display text-base font-bold text-foreground">
              Sem dados
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Você ainda não administra grupos com solicitações nos últimos 30
              dias.
            </p>
          </div>
        ) : (
          <>
            {/* Overall summary */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryCard
                icon={<Clock className="h-4 w-4 text-primary" />}
                label="Tempo médio"
                value={fmtDuration(totals.overallAvg)}
              />
              <SummaryCard
                icon={<CheckCircle2 className="h-4 w-4 text-success" />}
                label="Taxa aprovação"
                value={
                  totals.approvalRate !== null
                    ? `${Math.round(totals.approvalRate)}%`
                    : "—"
                }
                hint={`${totals.approved} aprov · ${totals.rejected} rec`}
              />
              <SummaryCard
                icon={<XCircle className="h-4 w-4 text-destructive" />}
                label="Recusados"
                value={String(totals.rejected)}
              />
              <SummaryCard
                icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
                label="Taxa crítica"
                value={`${Math.round(totals.criticalRate)}%`}
                hint={`${totals.critical} de ${totals.total}`}
                emphasis={totals.criticalRate >= 20}
              />
            </div>

            {/* Per-group breakdown */}
            <div className="rounded-3xl border border-border bg-card p-4">
              <h2 className="mb-3 font-display text-sm font-bold text-foreground">
                Por grupo
              </h2>
              <div className="space-y-2">
                {metrics.map((m) => {
                  const resolved = m.approved + m.rejected;
                  const apvRate =
                    resolved > 0 ? (m.approved / resolved) * 100 : null;
                  const critRate =
                    m.total > 0 ? (m.critical / m.total) * 100 : 0;
                  return (
                    <div
                      key={m.groupId}
                      className="rounded-2xl border border-border/50 bg-background/40 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Link
                          to="/groups/$groupId"
                          params={{ groupId: m.groupId }}
                          className="truncate font-display text-sm font-bold text-foreground hover:text-primary"
                        >
                          {m.groupName}
                        </Link>
                        {m.critical > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            {m.critical} crítico{m.critical > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
                        <Metric
                          label="Tempo médio"
                          value={fmtDuration(m.avgResponseMs)}
                        />
                        <Metric
                          label="Aprovação"
                          value={
                            apvRate !== null ? `${Math.round(apvRate)}%` : "—"
                          }
                          sub={`${m.approved}↑ / ${m.rejected}↓`}
                        />
                        <Metric label="Pendentes" value={String(m.pending)} />
                        <Metric
                          label="Crítica"
                          value={`${Math.round(critRate)}%`}
                          sub={`${m.total} total`}
                          emphasis={critRate >= 20}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  emphasis,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        emphasis
          ? "border-destructive/50 bg-destructive/10"
          : "border-border bg-card"
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`font-display text-xl font-bold ${
          emphasis ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`font-display text-sm font-bold ${
          emphasis ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
