import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, MailCheck, UserCheck, Clock, TrendingUp, Loader2 } from "lucide-react";

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
    const expired = list.filter((i) => {
      if (i.use_count > 0) return false;
      if (!i.expires_at) return false;
      return new Date(i.expires_at).getTime() < Date.now();
    }).length;
    const pending = list.filter((i) => {
      if (i.use_count > 0) return false;
      if (!i.is_active) return false;
      if (i.expires_at && new Date(i.expires_at).getTime() < Date.now()) return false;
      return true;
    }).length;
    const revoked = list.filter((i) => !i.is_active && i.use_count === 0).length;
    const rate = sent > 0 ? Math.round((converted / sent) * 100) : 0;

    return { sent, converted, expired, pending, revoked, rate, list };
  }, [invites, period]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 font-display text-base font-bold text-foreground">
          <BarChart3 className="h-4 w-4" /> Engajamento de convites
        </h3>
        <p className="text-xs text-muted-foreground">
          Convites de vinculação enviados a jogadores sem conta e quantos viraram contas reais.
        </p>
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

          {/* Recent invites table */}
          <div className="rounded-2xl border border-border bg-card/40">
            <div className="border-b border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground">
              Últimos convites
            </div>
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {stats.list.slice(0, 30).map((i) => {
                const status = i.use_count > 0
                  ? { label: "Vinculado", cls: "bg-success/15 text-success" }
                  : !i.is_active
                  ? { label: "Revogado", cls: "bg-muted text-muted-foreground" }
                  : i.expires_at && new Date(i.expires_at).getTime() < Date.now()
                  ? { label: "Expirado", cls: "bg-destructive/15 text-destructive" }
                  : { label: "Pendente", cls: "bg-warning/15 text-warning" };
                return (
                  <div key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[11px]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-foreground">{i.code}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(i.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>
                      {status.label}
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
