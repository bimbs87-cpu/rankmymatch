import { useEffect, useMemo, useState } from "react";
import { Loader2, ScrollText, Download, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  groupId: string;
}

interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  user_id: string;
  created_at: string;
  new_data: any;
  old_data: any;
}

const ACTION_LABELS: Record<string, string> = {
  presence_force_open: "Reabriu lista de presenças",
  presence_force_open_undo: "Desfez reabertura",
  member_removed: "Removeu membro",
  member_promoted: "Promoveu admin",
  season_created: "Criou temporada",
  season_finished: "Encerrou temporada",
  round_created: "Criou rodada",
  round_deleted: "Excluiu rodada",
  match_score_edited: "Editou placar",
  round_nudge: "Cutucou pendentes",
  round_nudge_cooldown_reset: "Resetou cooldown de cutucadas",
  waitlist_auto_promoted: "Auto-promoveu da lista de espera",
  waitlist_manual_promoted: "Promoveu manualmente da lista de espera",
};

const NUDGE_MODE_LABELS: Record<string, string> = {
  pending_only: "Só sem resposta",
  "pending+declined": "Sem resposta + quem recusou",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function csvEscape(value: string): string {
  const s = value ?? "";
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(rows: AuditRow[], actorNames: Record<string, string>) {
  const header = ["data", "ator", "acao", "entidade", "entidade_id", "motivo"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        fmtDate(r.created_at),
        actorNames[r.user_id] || r.user_id,
        ACTION_LABELS[r.action] || r.action,
        r.entity_type,
        r.entity_id ?? "",
        r.reason ?? "",
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Pretty single-line preview of a primitive value. */
function pretty(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Specialized side-by-side renderer for match_score_edited (sets array). */
function ScoreDiff({ oldData, newData }: { oldData: any; newData: any }) {
  const oldSets: Array<{ set_number?: number; score_team_a?: number; score_team_b?: number }> =
    Array.isArray(oldData?.sets) ? oldData.sets : [];
  const newSets: Array<{ set_number?: number; score_team_a?: number; score_team_b?: number }> =
    Array.isArray(newData?.sets) ? newData.sets : [];
  const max = Math.max(oldSets.length, newSets.length, 1);
  const rows = Array.from({ length: max }, (_, i) => ({
    n: i + 1,
    o: oldSets[i],
    nw: newSets[i],
  }));
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-lg border border-border bg-muted/20 p-2">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Antes</p>
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={`o${r.n}`} className="flex items-center justify-between rounded bg-background/40 px-2 py-1 text-xs">
              <span className="text-muted-foreground">Set {r.n}</span>
              <span className="font-mono font-bold text-foreground">
                {r.o ? `${r.o.score_team_a ?? "-"} × ${r.o.score_team_b ?? "-"}` : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-2">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Depois</p>
        <div className="space-y-1">
          {rows.map((r) => {
            const changed =
              !r.o ||
              !r.nw ||
              r.o.score_team_a !== r.nw.score_team_a ||
              r.o.score_team_b !== r.nw.score_team_b;
            return (
              <div
                key={`n${r.n}`}
                className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                  changed ? "bg-primary/15" : "bg-background/40"
                }`}
              >
                <span className="text-muted-foreground">Set {r.n}</span>
                <span className={`font-mono font-bold ${changed ? "text-primary" : "text-foreground"}`}>
                  {r.nw ? `${r.nw.score_team_a ?? "-"} × ${r.nw.score_team_b ?? "-"}` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Generic field-by-field diff for arbitrary objects. */
function GenericDiff({ oldData, newData }: { oldData: any; newData: any }) {
  const isObj = (v: any) => v && typeof v === "object" && !Array.isArray(v);
  const keys = Array.from(
    new Set([...(isObj(oldData) ? Object.keys(oldData) : []), ...(isObj(newData) ? Object.keys(newData) : [])]),
  );

  if (!keys.length) {
    return (
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Antes</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-foreground">{pretty(oldData)}</pre>
        </div>
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Depois</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-foreground">{pretty(newData)}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-[11px]">
        <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-1 text-left font-bold">Campo</th>
            <th className="px-2 py-1 text-left font-bold">Antes</th>
            <th className="px-2 py-1 text-left font-bold">Depois</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {keys.map((k) => {
            const ov = isObj(oldData) ? (oldData as any)[k] : undefined;
            const nv = isObj(newData) ? (newData as any)[k] : undefined;
            const changed = JSON.stringify(ov) !== JSON.stringify(nv);
            return (
              <tr key={k} className={changed ? "bg-primary/5" : ""}>
                <td className="px-2 py-1 font-mono text-muted-foreground">{k}</td>
                <td className="px-2 py-1 font-mono text-foreground/80">{pretty(ov)}</td>
                <td className={`px-2 py-1 font-mono ${changed ? "font-bold text-primary" : "text-foreground/80"}`}>
                  {pretty(nv)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NudgeDetail({ row }: { row: AuditRow }) {
  const d = row.new_data || {};
  const recipients = d.recipients_count ?? 0;
  const pending = d.pending_count ?? 0;
  const declined = d.declined_count ?? 0;
  const mode = d.mode ? NUDGE_MODE_LABELS[d.mode] || d.mode : null;
  const roundNum = d.round_number;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-warning/40 bg-warning/5 p-2">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-warning">
          Destinatários
        </p>
        <p className="text-2xl font-bold tabular-nums text-foreground">{recipients}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {pending} sem resposta · {declined} recusados
        </p>
      </div>
      <div className="rounded-lg border border-border bg-muted/20 p-2 text-[11px]">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Detalhes
          </span>
        </div>
        {mode && (
          <p className="text-foreground">
            <span className="text-muted-foreground">Modo:</span> {mode}
          </p>
        )}
        {roundNum != null && (
          <p className="text-foreground">
            <span className="text-muted-foreground">Rodada:</span> #{roundNum}
          </p>
        )}
      </div>
    </div>
  );
}

function NudgeResetDetail({ row }: { row: AuditRow }) {
  const d = row.new_data || {};
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2 text-[11px] text-foreground">
      <span className="text-muted-foreground">Rodada:</span>{" "}
      {d.round_number != null ? `#${d.round_number}` : "—"} · cooldown manual zerado.
    </div>
  );
}

function DiffView({ row }: { row: AuditRow }) {
  if (row.action === "round_nudge") {
    return <NudgeDetail row={row} />;
  }
  if (row.action === "round_nudge_cooldown_reset") {
    return <NudgeResetDetail row={row} />;
  }
  if (row.old_data == null && row.new_data == null) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/10 p-2 text-center text-[11px] text-muted-foreground">
        Sem dados de diff disponíveis para este evento.
      </p>
    );
  }
  if (row.action === "match_score_edited") {
    return <ScoreDiff oldData={row.old_data} newData={row.new_data} />;
  }
  return <GenericDiff oldData={row.old_data} newData={row.new_data} />;
}

/** Tiny inline SVG sparkline for nudge recipients trend. */
function Sparkline({ values, unit = "" }: { values: number[]; unit?: string }) {
  if (values.length < 2) return null;
  const w = 200;
  const h = 32;
  const pad = 2;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const stepX = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(" L ")}`;
  const half = Math.floor(values.length / 2);
  const a = values.slice(0, half).reduce((s, n) => s + n, 0) / Math.max(1, half);
  const b = values.slice(half).reduce((s, n) => s + n, 0) / Math.max(1, values.length - half);
  const trendingDown = b < a;
  const stroke = trendingDown ? "hsl(var(--success))" : "hsl(var(--warning))";
  return (
    <div className="flex items-center gap-2">
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="flex-1">
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {values.map((v, i) => {
          const x = pad + i * stepX;
          const y = h - pad - ((v - min) / range) * (h - pad * 2);
          return <circle key={i} cx={x} cy={y} r={1.8} fill={stroke} />;
        })}
      </svg>
      <span className={`text-[10px] font-bold tabular-nums ${trendingDown ? "text-success" : "text-warning"}`}>
        {trendingDown ? "↓" : "↑"} {Math.abs(Math.round(b - a))}{unit}
      </span>
    </div>
  );
}

export function AuditPanel({ groupId }: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [responseTimes, setResponseTimes] = useState<number[]>([]);
  const [roundMovements, setRoundMovements] = useState<
    Record<string, { round_number: number | null; scheduled_date: string | null }>
  >({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("audit_logs")
        .select("id, action, entity_type, entity_id, reason, user_id, created_at, new_data, old_data")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      const list = (data || []) as AuditRow[];
      setRows(list);
      const ids = Array.from(new Set(list.map((r) => r.user_id))).filter(Boolean);
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("user_profiles")
          .select("user_id, name")
          .in("user_id", ids);
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const p of (profs || []) as { user_id: string; name: string }[]) {
          map[p.user_id] = p.name;
        }
        setActorNames(map);
      }

      // Compute avg response time per nudge: time between nudge and next round_presence change
      // for that round, capped at next nudge for same round (or 24h).
      const nudges = list
        .filter((r) => r.action === "round_nudge" && r.entity_type === "round" && r.entity_id)
        .slice()
        // chronological asc
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const roundIds = Array.from(new Set(nudges.map((n) => n.entity_id as string)));
      const roundMeta: Record<string, { round_number: number | null; scheduled_date: string | null }> = {};
      const responseHours: number[] = [];
      if (roundIds.length > 0) {
        const { data: rds } = await supabase
          .from("rounds")
          .select("id, round_number, scheduled_date")
          .in("id", roundIds);
        for (const r of rds || []) {
          roundMeta[r.id] = { round_number: r.round_number, scheduled_date: r.scheduled_date };
        }
        const { data: presences } = await supabase
          .from("round_presence")
          .select("round_id, updated_at, status")
          .in("round_id", roundIds)
          .neq("status", "pending")
          .order("updated_at", { ascending: true });
        // Index presence updates per round
        const presByRound = new Map<string, { ts: number }[]>();
        for (const p of presences || []) {
          const arr = presByRound.get(p.round_id) || [];
          arr.push({ ts: new Date(p.updated_at).getTime() });
          presByRound.set(p.round_id, arr);
        }
        // Group nudges by round to find "next nudge" boundary
        const nudgesByRound = new Map<string, number[]>();
        for (const n of nudges) {
          const arr = nudgesByRound.get(n.entity_id as string) || [];
          arr.push(new Date(n.created_at).getTime());
          nudgesByRound.set(n.entity_id as string, arr);
        }
        for (const n of nudges) {
          const ts = new Date(n.created_at).getTime();
          const sameRoundNudges = nudgesByRound.get(n.entity_id as string) || [];
          const nextNudge = sameRoundNudges.find((t) => t > ts) ?? ts + 24 * 3600 * 1000;
          const pres = presByRound.get(n.entity_id as string) || [];
          const responses = pres.filter((p) => p.ts > ts && p.ts <= nextNudge);
          if (responses.length === 0) {
            responseHours.push(0);
          } else {
            const avgMs =
              responses.reduce((s, p) => s + (p.ts - ts), 0) / responses.length;
            responseHours.push(Math.max(0, Math.round((avgMs / (3600 * 1000)) * 10) / 10));
          }
        }
      }
      if (cancelled) return;
      setResponseTimes(responseHours.slice(-10));
      setRoundMovements(roundMeta);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const actions = useMemo(() => Array.from(new Set(rows.map((r) => r.action))).sort(), [rows]);
  const NUDGE_ACTIONS = new Set(["round_nudge", "round_nudge_cooldown_reset"]);
  const WAITLIST_ACTIONS = new Set(["waitlist_auto_promoted", "waitlist_manual_promoted"]);
  const ROUND_MOV_ACTIONS = new Set([
    "round_nudge",
    "round_nudge_cooldown_reset",
    "waitlist_auto_promoted",
    "waitlist_manual_promoted",
    "presence_force_open",
    "presence_force_open_undo",
  ]);
  const isNudgeFilter = filter === "__nudges__";
  const isWaitlistFilter = filter === "__waitlist__";
  const isRoundMovFilter = filter === "__round_movements__";
  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (isNudgeFilter) return rows.filter((r) => NUDGE_ACTIONS.has(r.action));
    if (isWaitlistFilter) return rows.filter((r) => WAITLIST_ACTIONS.has(r.action));
    if (isRoundMovFilter)
      return rows.filter(
        (r) => ROUND_MOV_ACTIONS.has(r.action) && r.entity_type === "round" && r.entity_id,
      );
    return rows.filter((r) => r.action === filter);
  }, [filter, rows, isNudgeFilter, isWaitlistFilter, isRoundMovFilter]);
  const nudgeCount = useMemo(
    () => rows.filter((r) => NUDGE_ACTIONS.has(r.action)).length,
    [rows],
  );
  const waitlistCount = useMemo(
    () => rows.filter((r) => WAITLIST_ACTIONS.has(r.action)).length,
    [rows],
  );
  const roundMovCount = useMemo(
    () =>
      rows.filter(
        (r) => ROUND_MOV_ACTIONS.has(r.action) && r.entity_type === "round" && r.entity_id,
      ).length,
    [rows],
  );

  // Grouped by round for "Movimentações da rodada" view
  const movementsByRound = useMemo(() => {
    if (!isRoundMovFilter) return [] as { roundId: string; events: AuditRow[] }[];
    const groups = new Map<string, AuditRow[]>();
    for (const r of filtered) {
      const k = r.entity_id as string;
      const arr = groups.get(k) || [];
      arr.push(r);
      groups.set(k, arr);
    }
    // Sort events ASC inside each round (chronological story)
    const out = Array.from(groups.entries()).map(([roundId, events]) => ({
      roundId,
      events: events.slice().sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    }));
    // Sort rounds DESC by most recent event
    out.sort((a, b) => {
      const lastA = a.events[a.events.length - 1].created_at;
      const lastB = b.events[b.events.length - 1].created_at;
      return new Date(lastB).getTime() - new Date(lastA).getTime();
    });
    return out;
  }, [filtered, isRoundMovFilter]);

  // Aggregated stats for "Só cutucadas" filter — only round_nudge entries (not cooldown resets)
  const nudgeStats = useMemo(() => {
    const nudges = rows.filter((r) => r.action === "round_nudge");
    if (nudges.length === 0) {
      return {
        total: 0,
        recipients: 0,
        pendingPct: 0,
        declinedPct: 0,
        lastAt: null as string | null,
        sparkline: [] as number[],
        pendingPctSparkline: [] as number[],
      };
    }
    let recipients = 0;
    let pending = 0;
    let declined = 0;
    for (const r of nudges) {
      const d = r.new_data || {};
      recipients += Number(d.recipients_count ?? 0);
      pending += Number(d.pending_count ?? 0);
      declined += Number(d.declined_count ?? 0);
    }
    const sumPD = pending + declined;
    // Sparklines: last 10 nudges, oldest → newest.
    // (rows is sorted DESC by created_at, so reverse.)
    const last10 = nudges.slice(0, 10).reverse();
    const sparkline = last10.map((r) => Number((r.new_data || {}).recipients_count ?? 0));
    const pendingPctSparkline = last10.map((r) => {
      const d = r.new_data || {};
      const p = Number(d.pending_count ?? 0);
      const dc = Number(d.declined_count ?? 0);
      const total = p + dc;
      return total > 0 ? Math.round((p / total) * 100) : 0;
    });
    return {
      total: nudges.length,
      recipients,
      pendingPct: sumPD > 0 ? Math.round((pending / sumPD) * 100) : 0,
      declinedPct: sumPD > 0 ? Math.round((declined / sumPD) * 100) : 0,
      lastAt: nudges[0]?.created_at ?? null,
      sparkline,
      pendingPctSparkline,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-foreground">
            <ScrollText className="h-4 w-4" /> Auditoria
          </h3>
          <p className="text-xs text-muted-foreground">
            Últimos 50 eventos registrados para o grupo. Clique para ver o diff.
          </p>
        </div>
        <button
          onClick={() => downloadCsv(filtered, actorNames)}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          title="Exportar eventos filtrados como CSV"
        >
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Filtrar:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">Todas as ações ({rows.length})</option>
          <option value="__nudges__">Só cutucadas ({nudgeCount})</option>
          <option value="__waitlist__">Só lista de espera ({waitlistCount})</option>
          <option value="__round_movements__">Movimentações da rodada ({roundMovCount})</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a] || a}
            </option>
          ))}
        </select>
        {nudgeCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter(isNudgeFilter ? "all" : "__nudges__")}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
              isNudgeFilter
                ? "border-warning/60 bg-warning/15 text-warning"
                : "border-border bg-background text-muted-foreground hover:border-warning/40 hover:text-warning"
            }`}
            title="Atalho: filtra round_nudge + round_nudge_cooldown_reset"
          >
            🔔 Só cutucadas ({nudgeCount})
          </button>
        )}
        {waitlistCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter(isWaitlistFilter ? "all" : "__waitlist__")}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
              isWaitlistFilter
                ? "border-info/60 bg-info/15 text-info"
                : "border-border bg-background text-muted-foreground hover:border-info/40 hover:text-info"
            }`}
            title="Atalho: filtra promoções automáticas e manuais da lista de espera"
          >
            🎟️ Só lista de espera ({waitlistCount})
          </button>
        )}
        {roundMovCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter(isRoundMovFilter ? "all" : "__round_movements__")}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
              isRoundMovFilter
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary"
            }`}
            title="Timeline consolidada por rodada: cutucadas, lista de espera, abrir presença"
          >
            🎬 Movimentações da rodada ({roundMovCount})
          </button>
        )}
      </div>

      {isNudgeFilter && nudgeStats.total > 0 && (
        <div className="space-y-2 rounded-xl border border-warning/30 bg-warning/5 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-warning/80">
                Total de destinatários
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
                {nudgeStats.recipients}
              </p>
              <p className="text-[10px] text-muted-foreground">
                em {nudgeStats.total} cutucada{nudgeStats.total !== 1 ? "s" : ""}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-warning/80">
                Pendentes vs recusados
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
                {nudgeStats.pendingPct}% / {nudgeStats.declinedPct}%
              </p>
              <p className="text-[10px] text-muted-foreground">média acumulada</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-warning/80">
                Última cutucada
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">
                {nudgeStats.lastAt ? fmtDate(nudgeStats.lastAt) : "—"}
              </p>
            </div>
          </div>
          {nudgeStats.sparkline.length >= 2 && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[9px] font-bold uppercase tracking-wider text-warning/80">
                  Destinatários por cutucada (últimas {nudgeStats.sparkline.length})
                </p>
                <p className="text-[9px] text-muted-foreground">
                  ↓ menos = mais gente respondendo sozinha
                </p>
              </div>
              <Sparkline values={nudgeStats.sparkline} />
            </div>
          )}
          {nudgeStats.pendingPctSparkline.length >= 2 && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[9px] font-bold uppercase tracking-wider text-warning/80">
                  % pendentes por cutucada (últimas {nudgeStats.pendingPctSparkline.length})
                </p>
                <p className="text-[9px] text-muted-foreground">
                  ↓ menos % = galera mais responsiva
                </p>
              </div>
              <Sparkline values={nudgeStats.pendingPctSparkline} unit="%" />
            </div>
          )}
          {responseTimes.length >= 2 && (() => {
            const nonZero = responseTimes.filter((v) => v > 0);
            const avg = nonZero.length > 0
              ? nonZero.reduce((s, n) => s + n, 0) / nonZero.length
              : 0;
            const avgLabel = avg >= 10 ? `${Math.round(avg)}h` : `${avg.toFixed(1)}h`;
            return (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-warning/80">
                    Tempo médio de resposta (h) — últimas {responseTimes.length}
                  </p>
                  {(() => {
                    const tone =
                      avg <= 0
                        ? "muted"
                        : avg < 1
                          ? "success"
                          : avg <= 6
                            ? "warning"
                            : "destructive";
                    const toneCls =
                      tone === "success"
                        ? "border-success/40 bg-success/10 text-success"
                        : tone === "warning"
                          ? "border-warning/40 bg-warning/10 text-warning"
                          : tone === "destructive"
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-border bg-muted/40 text-muted-foreground";
                    return (
                      <span
                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${toneCls}`}
                        title="Tempo médio geral, ignorando cutucadas sem resposta. Verde <1h · Amarelo 1-6h · Vermelho >6h"
                      >
                        <Clock className="h-2.5 w-2.5" /> Média geral: {avgLabel}
                      </span>
                    );
                  })()}
                </div>
                <Sparkline values={responseTimes} unit="h" />
              </div>
            );
          })()}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/10 p-4 text-center text-xs text-muted-foreground">
          Nenhum evento registrado{filter !== "all" ? " para esta ação" : ""}.
        </p>
      ) : isRoundMovFilter ? (
        <ul className="space-y-3">
          {movementsByRound.map(({ roundId, events }) => {
            const meta = roundMovements[roundId];
            const title = meta?.round_number != null ? `Rodada #${meta.round_number}` : `Rodada ${roundId.slice(0, 8)}`;
            const sub = meta?.scheduled_date
              ? new Date(meta.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR")
              : null;
            return (
              <li key={roundId} className="overflow-hidden rounded-xl border border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between gap-2 border-b border-primary/20 bg-primary/10 px-3 py-2">
                  <p className="text-xs font-bold text-foreground">
                    🎬 {title}
                    {sub && <span className="ml-1 text-[10px] font-normal text-muted-foreground">· {sub}</span>}
                  </p>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {events.length} evento{events.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <ol className="relative space-y-2 p-3">
                  {events.map((r, idx) => {
                    const label = ACTION_LABELS[r.action] || r.action;
                    const actor = actorNames[r.user_id] || "Usuário";
                    const isNudge = r.action === "round_nudge";
                    const isWait = WAITLIST_ACTIONS.has(r.action);
                    const isOpen2 = !!expanded[r.id];
                    const hasDiff = r.old_data != null || r.new_data != null;
                    const dotColor = isNudge
                      ? "bg-warning"
                      : isWait
                        ? "bg-info"
                        : "bg-primary";
                    return (
                      <li key={r.id} className="relative pl-5">
                        <span
                          className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${dotColor}`}
                        />
                        {idx < events.length - 1 && (
                          <span className="absolute left-1 top-4 h-full w-px bg-border" />
                        )}
                        <button
                          type="button"
                          onClick={() => setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))}
                          className="block w-full rounded-lg border border-border bg-background/60 p-2 text-left hover:bg-muted/20"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-foreground">{label}</p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                por <span className="text-foreground">{actor}</span> · {fmtDate(r.created_at)}
                              </p>
                            </div>
                            {hasDiff && (
                              <span className="mt-0.5 shrink-0 text-muted-foreground">
                                {isOpen2 ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </span>
                            )}
                          </div>
                          {isOpen2 && hasDiff && (
                            <div className="mt-2 border-t border-border pt-2">
                              <DiffView row={r} />
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const label = ACTION_LABELS[r.action] || r.action;
            const actor = actorNames[r.user_id] || "Usuário";
            const isOpen = !!expanded[r.id];
            const hasDiff = r.old_data != null || r.new_data != null;
            return (
              <li key={r.id} className="overflow-hidden rounded-xl border border-border bg-background/40">
                <button
                  type="button"
                  onClick={() => setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))}
                  className="flex w-full items-start gap-2 p-3 text-left hover:bg-muted/20"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground">{label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      por <span className="text-foreground">{actor}</span> · {fmtDate(r.created_at)}
                    </p>
                    {r.reason && (
                      <p className="mt-1 text-[11px] italic text-muted-foreground">"{r.reason}"</p>
                    )}
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      {r.entity_type}
                      {r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}
                    </p>
                  </div>
                  {hasDiff && (
                    <span className="mt-0.5 shrink-0 text-muted-foreground">
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  )}
                </button>
                {isOpen && hasDiff && (
                  <div className="border-t border-border bg-muted/10 p-3">
                    <DiffView row={r} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
