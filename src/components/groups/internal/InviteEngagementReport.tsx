import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, MailCheck, UserCheck, Clock, TrendingUp, Loader2, Download, LineChart as LineIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";

type Period = "7d" | "30d" | "90d" | "all";
type Granularity = "week" | "month";
type StatusFilter = "all" | "Vinculado" | "Pendente" | "Expirado" | "Revogado";

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
  created_by: string | null;
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

function startOfMonth(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), 1);
  out.setHours(0, 0, 0, 0);
  return out;
}

function fmtMonthLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function fmtMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function statusOf(i: InviteRow): "Vinculado" | "Revogado" | "Expirado" | "Pendente" {
  if (i.use_count > 0) return "Vinculado";
  if (!i.is_active) return "Revogado";
  if (i.expires_at && new Date(i.expires_at).getTime() < Date.now()) return "Expirado";
  return "Pendente";
}

export function InviteEngagementReport({ groupId }: Props) {
  const [period, setPeriod] = useState<Period>("30d");
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [exportFilter, setExportFilter] = useState<StatusFilter>("all");
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("invite_links")
        .select("id, code, created_at, expires_at, is_active, use_count, max_uses, claim_placeholder_user_id, created_by")
        .eq("group_id", groupId)
        .not("claim_placeholder_user_id", "is", null)
        .order("created_at", { ascending: false });
      if (!active) return;
      const list = (data || []) as InviteRow[];
      setInvites(list);

      // Build user_id -> name map for placeholders + creators
      const ids = new Set<string>();
      for (const i of list) {
        if (i.claim_placeholder_user_id) ids.add(i.claim_placeholder_user_id);
        if (i.created_by) ids.add(i.created_by);
      }
      if (ids.size) {
        const { data: profs } = await supabase
          .from("user_profiles")
          .select("user_id, name, nickname")
          .in("user_id", Array.from(ids));
        if (active) {
          setProfileMap(new Map((profs || []).map((p) => [p.user_id, p.nickname || p.name || ""])));
        }
      }
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

  // Trend by selected granularity (week or month)
  const trend = useMemo(() => {
    if (stats.list.length === 0) return [];
    const days = PERIOD_OPTS.find((p) => p.id === period)?.days;
    const now = new Date();
    const startBound = days != null ? new Date(Date.now() - days * 86400000) : new Date(Math.min(...stats.list.map((i) => new Date(i.created_at).getTime())));

    const buckets = new Map<string, { start: Date; sent: number; converted: number }>();
    if (granularity === "week") {
      let cursor = startOfWeek(startBound);
      const end = startOfWeek(now);
      while (cursor.getTime() <= end.getTime()) {
        buckets.set(fmtWeekKey(cursor), { start: new Date(cursor), sent: 0, converted: 0 });
        cursor = new Date(cursor.getTime() + 7 * 86400000);
      }
      for (const i of stats.list) {
        const k = fmtWeekKey(startOfWeek(new Date(i.created_at)));
        const b = buckets.get(k);
        if (!b) continue;
        b.sent += 1;
        if (i.use_count > 0) b.converted += 1;
      }
    } else {
      let cursor = startOfMonth(startBound);
      const end = startOfMonth(now);
      while (cursor.getTime() <= end.getTime()) {
        buckets.set(fmtMonthKey(cursor), { start: new Date(cursor), sent: 0, converted: 0 });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      for (const i of stats.list) {
        const k = fmtMonthKey(startOfMonth(new Date(i.created_at)));
        const b = buckets.get(k);
        if (!b) continue;
        b.sent += 1;
        if (i.use_count > 0) b.converted += 1;
      }
    }

    return Array.from(buckets.values())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((b) => ({
        bucket: granularity === "week" ? fmtWeekLabel(b.start) : fmtMonthLabel(b.start),
        Enviados: b.sent,
        Vinculados: b.converted,
        Conversao: b.sent > 0 ? Math.round((b.converted / b.sent) * 100) : 0,
      }));
  }, [stats.list, period, granularity]);

  const exportCsv = () => {
    const filtered = exportFilter === "all"
      ? stats.list
      : stats.list.filter((i) => statusOf(i) === exportFilter);
    if (filtered.length === 0) {
      toast.info("Nada para exportar com esse filtro");
      return;
    }
    const header = ["codigo", "jogador_alvo", "criado_por", "criado_em", "expira_em", "usos", "status"];
    const rows = filtered.map((i) => [
      i.code,
      i.claim_placeholder_user_id ? (profileMap.get(i.claim_placeholder_user_id) || "") : "",
      i.created_by ? (profileMap.get(i.created_by) || "") : "",
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
    a.download = `convites-${exportFilter}-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`CSV exportado (${filtered.length})`);
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
        <div className="flex shrink-0 items-center gap-1.5">
          <select
            value={exportFilter}
            onChange={(e) => setExportFilter(e.target.value as StatusFilter)}
            disabled={loading}
            className="rounded-full border border-border bg-background px-2 py-1 text-[10px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            title="Filtrar exportação por status"
          >
            <option value="all">Todos</option>
            <option value="Pendente">Só pendentes</option>
            <option value="Vinculado">Só vinculados</option>
            <option value="Expirado">Só expirados</option>
            <option value="Revogado">Só revogados</option>
          </select>
          <button
            onClick={exportCsv}
            disabled={loading || stats.sent === 0}
            className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-[10px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            title="Exportar CSV"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
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

          {/* Trend chart with granularity toggle */}
          {trend.length > 1 && (
            <div className="rounded-2xl border border-border bg-card/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                  <LineIcon className="h-3 w-3" /> Tendência {granularity === "week" ? "semanal" : "mensal"}
                </div>
                <div className="flex items-center gap-0.5 rounded-full bg-muted/40 p-0.5">
                  <button
                    onClick={() => setGranularity("week")}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
                      granularity === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Semanal
                  </button>
                  <button
                    onClick={() => setGranularity("month")}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
                      granularity === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Mensal
                  </button>
                </div>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 6, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--info))" }} unit="%" width={34} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                        fontSize: 11,
                      }}
                      formatter={(value: any, name: any) => name === "Conversão %" ? [`${value}%`, "Conversão"] : [value, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line yAxisId="left" type="monotone" dataKey="Enviados" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={{ r: 2 }} />
                    <Line yAxisId="left" type="monotone" dataKey="Vinculados" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 2 }} />
                    <Line yAxisId="right" type="monotone" dataKey="Conversao" name="Conversão %" stroke="hsl(var(--info))" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2 }} />
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
