import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, MailCheck, UserCheck, Clock, TrendingUp, Loader2, Download, LineChart as LineIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";

type Period = "7d" | "30d" | "90d" | "all";

interface Props {
  groupId: string;
}

interface InviteRow {
  id: string;
  code: string;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  use_count: number;
  max_uses: number | null;
  claim_placeholder_user_id: string | null;
}

const PERIOD_OPTS: { id: Period; label: string; days: number | null }[] = [
  { id: "7d", label: "7 dias", days: 7 },
  { id: "30d", label: "30 dias", days: 30 },
  { id: "90d", label: "90 dias", days: 90 },
  { id: "all", label: "Tudo", days: null },
];

// Get start of ISO week (Monday) for a given date
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  out.setDate(out.getDate() - diff);
  return out;
}

function fmtWeekLabel(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function fmtWeekKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function statusOf(i: InviteRow): "Vinculado" | "Revogado" | "Expirado" | "Pendente" {
  if (i.use_count > 0) return "Vinculado";
  if (!i.is_active) return "Revogado";
  if (i.expires_at && new Date(i.expires_at).getTime() < Date.now()) return "Expirado";
  return "Pendente";
}

export function InviteEngagementReport({ groupId }: Props) {
  const [period, setPeriod] = useState<Period>("30d");
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("invite_links")
        .select("id, code, created_at, expires_at, is_active, use_count, max_uses, claim_placeholder_user_id")
        .eq("group_id", groupId)
        .not("claim_placeholder_user_id", "is", null)
        .order("created_at", { ascending: false });
      if (!active) return;
      setInvites((data || []) as InviteRow[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [groupId]);

  const stats = useMemo(() => {
    const days = PERIOD_OPTS.find((p) => p.id === period)?.days;
    const cutoff = days != null ? Date.now() - days * 86400000 : 0;
    const list = invites.filter((i) => new Date(i.created_at).getTime() >= cutoff);

    const sent = list.length;
    const converted = list.filter((i) => i.use_count > 0).length;
    const expired = list.filter((i) => statusOf(i) === "Expirado").length;
    const pending = list.filter((i) => statusOf(i) === "Pendente").length;
    const revoked = list.filter((i) => statusOf(i) === "Revogado").length;
    const rate = sent > 0 ? Math.round((converted / sent) * 100) : 0;

    return { sent, converted, expired, pending, revoked, rate, list };
  }, [invites, period]);

  // Weekly trend: aggregate by ISO week (Mon-Sun) within selected period
  const weekly = useMemo(() => {
    if (stats.list.length === 0) return [];
    const days = PERIOD_OPTS.find((p) => p.id === period)?.days;
    // Determine range: from earliest to now (or cutoff)
    const now = new Date();
    const startBound = days != null ? new Date(Date.now() - days * 86400000) : new Date(Math.min(...stats.list.map((i) => new Date(i.created_at).getTime())));

    // Build buckets per week
    const buckets = new Map<string, { weekStart: Date; sent: number; converted: number }>();
    let cursor = startOfWeek(startBound);
    const endCursor = startOfWeek(now);
    while (cursor.getTime() <= endCursor.getTime()) {
      buckets.set(fmtWeekKey(cursor), { weekStart: new Date(cursor), sent: 0, converted: 0 });
      cursor = new Date(cursor.getTime() + 7 * 86400000);
    }

    for (const i of stats.list) {
      const w = startOfWeek(new Date(i.created_at));
      const key = fmtWeekKey(w);
      const b = buckets.get(key);
      if (!b) continue;
      b.sent += 1;
      if (i.use_count > 0) b.converted += 1;
    }

    return Array.from(buckets.values())
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
      .map((b) => ({ week: fmtWeekLabel(b.weekStart), Enviados: b.sent, Vinculados: b.converted }));
  }, [stats.list, period]);

  const exportCsv = () => {
    if (stats.list.length === 0) {
      toast.info("Nada para exportar nesse período");
      return;
    }
    const header = ["codigo", "criado_em", "expira_em", "usos", "status"];
    const rows = stats.list.map((i) => [
      i.code,
      new Date(i.created_at).toISOString(),
      i.expires_at ? new Date(i.expires_at).toISOString() : "",
      String(i.use_count),
      statusOf(i),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `convites-engajamento-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-foreground">
            <BarChart3 className="h-4 w-4" /> Engajamento de convites
          </h3>
          <p className="text-xs text-muted-foreground">
            Convites de vinculação enviados a jogadores sem conta e quantos viraram contas reais.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={loading || stats.sent === 0}
          className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-[10px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          title="Exportar CSV"
        >
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-1.5">
        {PERIOD_OPTS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              period === p.id ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : stats.sent === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-6 text-center text-xs text-muted-foreground">
          Nenhum convite de vinculação enviado nesse período.
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KpiCard icon={MailCheck} label="Enviados" value={stats.sent} tone="muted" />
            <KpiCard icon={UserCheck} label="Vinculados" value={stats.converted} tone="success" />
            <KpiCard icon={Clock} label="Pendentes" value={stats.pending} tone="warning" />
            <KpiCard icon={TrendingUp} label="Conversão" value={`${stats.rate}%`} tone="info" />
          </div>

          {/* Conversion bar */}
          <div className="rounded-2xl border border-border bg-card/40 p-3">
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-foreground">Taxa de conversão</span>
              <span className="font-bold text-success">{stats.converted}/{stats.sent}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success transition-all"
                style={{ width: `${stats.rate}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span><span className="inline-block h-2 w-2 rounded-full bg-success mr-1" />{stats.converted} virou conta</span>
              <span><span className="inline-block h-2 w-2 rounded-full bg-warning mr-1" />{stats.pending} pendentes</span>
              <span><span className="inline-block h-2 w-2 rounded-full bg-destructive/60 mr-1" />{stats.expired} expirados</span>
              {stats.revoked > 0 && <span><span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40 mr-1" />{stats.revoked} revogados</span>}
            </div>
          </div>

          {/* Weekly trend chart */}
          {weekly.length > 1 && (
            <div className="rounded-2xl border border-border bg-card/40 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                <LineIcon className="h-3 w-3" /> Tendência semanal
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weekly} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                        fontSize: 11,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="Enviados" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="Vinculados" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Recent invites table */}
          <div className="rounded-2xl border border-border bg-card/40">
            <div className="border-b border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground">
              Últimos convites
            </div>
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {stats.list.slice(0, 30).map((i) => {
                const s = statusOf(i);
                const cls =
                  s === "Vinculado" ? "bg-success/15 text-success"
                  : s === "Revogado" ? "bg-muted text-muted-foreground"
                  : s === "Expirado" ? "bg-destructive/15 text-destructive"
                  : "bg-warning/15 text-warning";
                return (
                  <div key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[11px]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-foreground">{i.code}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(i.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>
                      {s}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, tone,
}: { icon: typeof MailCheck; label: string; value: number | string; tone: "muted" | "success" | "warning" | "info" }) {
  const toneCls = {
    muted: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    info: "text-info",
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />{label}
      </div>
      <div className={`font-display text-xl font-bold ${toneCls}`}>{value}</div>
    </div>
  );
}
