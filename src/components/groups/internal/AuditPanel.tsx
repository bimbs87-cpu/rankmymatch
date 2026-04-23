import { useEffect, useMemo, useState } from "react";
import { Loader2, ScrollText, Download, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  group_visibility_changed: "Mudou visibilidade do grupo",
  group_member_limit_changed: "Mudou limite de membros",
};

const VISIBILITY_LABELS: Record<string, string> = {
  public: "Público",
  private: "Privado",
  hidden: "Oculto",
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

function VisibilityDiff({ row }: { row: AuditRow }) {
  const oldV = row.old_data?.visibility ?? "—";
  const newV = row.new_data?.visibility ?? "—";
  const oldLabel = VISIBILITY_LABELS[oldV] || oldV;
  const newLabel = VISIBILITY_LABELS[newV] || newV;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2 text-xs">
      <span className="rounded-md bg-background px-2 py-0.5 font-mono text-foreground/80">{oldLabel}</span>
      <span className="text-muted-foreground">→</span>
      <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono font-bold text-primary">{newLabel}</span>
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
  if (row.action === "group_visibility_changed") {
    return <VisibilityDiff row={row} />;
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
function Sparkline({
  values,
  unit = "",
  medianLine,
  p90Line,
  pointLabels,
}: {
  values: number[];
  unit?: string;
  /** Optional value to draw as a horizontal dashed reference line (e.g. median). */
  medianLine?: number;
  /** Optional value to draw as a red dashed reference line (e.g. p90). */
  p90Line?: number;
  /** Optional per-point label (e.g. round number) to show in tooltip. */
  pointLabels?: Array<number | null | string>;
}) {
  if (values.length < 2) return null;
  const w = 200;
  const h = 32;
  const pad = 2;
  const refs = [medianLine, p90Line].filter((v): v is number => typeof v === "number");
  const max = Math.max(...values, 1, ...refs);
  const min = Math.min(...values, 0, ...refs);
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
  const medianY =
    typeof medianLine === "number"
      ? h - pad - ((medianLine - min) / range) * (h - pad * 2)
      : null;
  const medianLabel =
    typeof medianLine === "number"
      ? medianLine >= 10
        ? `${Math.round(medianLine)}${unit}`
        : `${medianLine.toFixed(1)}${unit}`
      : "";
  const p90Y =
    typeof p90Line === "number"
      ? h - pad - ((p90Line - min) / range) * (h - pad * 2)
      : null;
  const p90Label =
    typeof p90Line === "number"
      ? p90Line >= 10
        ? `${Math.round(p90Line)}${unit}`
        : `${p90Line.toFixed(1)}${unit}`
      : "";
  // Avoid label overlap when p90 and median land close to each other.
  const p90LabelAnchor = medianY !== null && p90Y !== null && Math.abs(p90Y - medianY) < 10 ? "start" : "end";
  const p90LabelX = p90LabelAnchor === "start" ? pad : w - pad;
  // Zone band Y boundaries (only meaningful for response-time sparklines, where unit==="h")
  const showZones = unit === "h";
  const yForVal = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const clampY = (y: number) => Math.max(pad, Math.min(h - pad, y));
  const greenTop = showZones ? clampY(yForVal(1)) : 0;
  const yellowTop = showZones ? clampY(yForVal(6)) : 0;
  const yellowBottom = showZones ? clampY(yForVal(1)) : 0;
  const redBottom = showZones ? clampY(yForVal(6)) : 0;
  return (
    <div className="flex items-center gap-2">
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="flex-1">
        {showZones && (
          <>
            {greenTop < h - pad && (
              <rect x={pad} y={greenTop} width={w - pad * 2} height={(h - pad) - greenTop} fill="hsl(var(--success))" opacity={0.08} />
            )}
            {yellowTop < yellowBottom && (
              <rect x={pad} y={yellowTop} width={w - pad * 2} height={yellowBottom - yellowTop} fill="hsl(var(--warning))" opacity={0.08} />
            )}
            {redBottom > pad && (
              <rect x={pad} y={pad} width={w - pad * 2} height={redBottom - pad} fill="hsl(var(--destructive))" opacity={0.08} />
            )}
          </>
        )}
        {medianY !== null && (
          <>
            <line
              x1={pad}
              x2={w - pad}
              y1={medianY}
              y2={medianY}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
            >
              <title>{`Mediana: ${medianLabel}`}</title>
            </line>
            <text
              x={w - pad}
              y={Math.max(8, medianY - 2)}
              textAnchor="end"
              fontSize={8}
              fill="hsl(var(--muted-foreground))"
              opacity={0.85}
            >
              {`med ${medianLabel}`}
            </text>
          </>
        )}
        {p90Y !== null && (
          <>
            <line
              x1={pad}
              x2={w - pad}
              y1={p90Y}
              y2={p90Y}
              stroke="hsl(var(--destructive))"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.7}
            >
              <title>{`p90: ${p90Label}`}</title>
            </line>
            <text
              x={p90LabelX}
              y={Math.max(8, p90Y - 2)}
              textAnchor={p90LabelAnchor}
              fontSize={8}
              fill="hsl(var(--destructive))"
              opacity={0.9}
            >
              {`p90 ${p90Label}`}
            </text>
          </>
        )}
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {values.map((v, i) => {
          const x = pad + i * stepX;
          const y = h - pad - ((v - min) / range) * (h - pad * 2);
          const lbl = pointLabels?.[i];
          const lblPart = lbl != null && lbl !== "" ? `Rodada #${lbl} · ` : "";
          const valPart = v >= 10 ? `${Math.round(v)}${unit}` : `${v.toFixed(1)}${unit}`;
          const tip = `${lblPart}média ${valPart}`;
          return (
            <circle key={i} cx={x} cy={y} r={1.8} fill={stroke}>
              <title>{tip}</title>
            </circle>
          );
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
  const [responseTimeLabels, setResponseTimeLabels] = useState<Array<number | null>>([]);
  const [slowResponders, setSlowResponders] = useState<
    Array<{ userId: string; hours: number; roundNumber: number | null; nudgeAt: number }>
  >([]);
  const [slowGroupedExpanded, setSlowGroupedExpanded] = useState<Record<string, boolean>>({});
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
      const responseLabels: Array<number | null> = [];
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
          .select("round_id, user_id, updated_at, status")
          .in("round_id", roundIds)
          .neq("status", "pending")
          .order("updated_at", { ascending: true });
        // Index presence updates per round (with user)
        const presByRound = new Map<string, { ts: number; userId: string }[]>();
        for (const p of presences || []) {
          const arr = presByRound.get(p.round_id) || [];
          arr.push({ ts: new Date(p.updated_at).getTime(), userId: p.user_id });
          presByRound.set(p.round_id, arr);
        }
        // Group nudges by round to find "next nudge" boundary
        const nudgesByRound = new Map<string, number[]>();
        for (const n of nudges) {
          const arr = nudgesByRound.get(n.entity_id as string) || [];
          arr.push(new Date(n.created_at).getTime());
          nudgesByRound.set(n.entity_id as string, arr);
        }
        const slow: Array<{ userId: string; hours: number; roundNumber: number | null; nudgeAt: number }> = [];
        for (const n of nudges) {
          const ts = new Date(n.created_at).getTime();
          const roundId = n.entity_id as string;
          const sameRoundNudges = nudgesByRound.get(roundId) || [];
          const nextNudge = sameRoundNudges.find((t) => t > ts) ?? ts + 24 * 3600 * 1000;
          const pres = presByRound.get(roundId) || [];
          const responses = pres.filter((p) => p.ts > ts && p.ts <= nextNudge);
          responseLabels.push(roundMeta[roundId]?.round_number ?? null);
          if (responses.length === 0) {
            responseHours.push(0);
          } else {
            const avgMs =
              responses.reduce((s, p) => s + (p.ts - ts), 0) / responses.length;
            responseHours.push(Math.max(0, Math.round((avgMs / (3600 * 1000)) * 10) / 10));
            // Capture per-recipient slow responses (>6h) for outlier popover
            for (const r of responses) {
              const hours = (r.ts - ts) / (3600 * 1000);
              if (hours > 6) {
                slow.push({
                  userId: r.userId,
                  hours: Math.round(hours * 10) / 10,
                  roundNumber: roundMeta[roundId]?.round_number ?? null,
                  nudgeAt: ts,
                });
              }
            }
          }
        }
        // Resolve names for slow responders not already in actorNames map
        const slowIds = Array.from(new Set(slow.map((s) => s.userId))).filter((id) => !ids.includes(id));
        if (slowIds.length > 0) {
          const { data: extraProfs } = await supabase
            .from("user_profiles")
            .select("user_id, name")
            .in("user_id", slowIds);
          if (cancelled) return;
          const extra: Record<string, string> = {};
          for (const p of (extraProfs || []) as { user_id: string; name: string }[]) {
            extra[p.user_id] = p.name;
          }
          if (Object.keys(extra).length > 0) {
            setActorNames((prev) => ({ ...prev, ...extra }));
          }
        }
        if (cancelled) return;
        // Sort slowest first, keep top 20
        setSlowResponders(slow.sort((a, b) => b.hours - a.hours).slice(0, 20));
      }
      if (cancelled) return;
      setResponseTimes(responseHours.slice(-10));
      setResponseTimeLabels(responseLabels.slice(-10));
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
  const VISIBILITY_ACTIONS = new Set(["group_visibility_changed"]);
  const isNudgeFilter = filter === "__nudges__";
  const isWaitlistFilter = filter === "__waitlist__";
  const isRoundMovFilter = filter === "__round_movements__";
  const isVisibilityFilter = filter === "__visibility__";
  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (isNudgeFilter) return rows.filter((r) => NUDGE_ACTIONS.has(r.action));
    if (isWaitlistFilter) return rows.filter((r) => WAITLIST_ACTIONS.has(r.action));
    if (isVisibilityFilter) return rows.filter((r) => VISIBILITY_ACTIONS.has(r.action));
    if (isRoundMovFilter)
      return rows.filter(
        (r) => ROUND_MOV_ACTIONS.has(r.action) && r.entity_type === "round" && r.entity_id,
      );
    return rows.filter((r) => r.action === filter);
  }, [filter, rows, isNudgeFilter, isWaitlistFilter, isRoundMovFilter, isVisibilityFilter]);
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
  const visibilityCount = useMemo(
    () => rows.filter((r) => VISIBILITY_ACTIONS.has(r.action)).length,
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
          <option value="__visibility__">Mudanças de visibilidade ({visibilityCount})</option>
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
        {visibilityCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter(isVisibilityFilter ? "all" : "__visibility__")}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
              isVisibilityFilter
                ? "border-accent/60 bg-accent/15 text-accent-foreground"
                : "border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground"
            }`}
            title="Mostra todas as mudanças de visibilidade do grupo (público / privado / oculto)"
          >
            👁️ Visibilidade ({visibilityCount})
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
            // Median of responded ones
            const sorted = [...nonZero].sort((a, b) => a - b);
            const median = sorted.length === 0
              ? 0
              : sorted.length % 2 === 1
                ? sorted[(sorted.length - 1) / 2]
                : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
            const medianLabel = median >= 10 ? `${Math.round(median)}h` : `${median.toFixed(1)}h`;
            // p90: linear interpolation on sorted responded values
            const p90 = (() => {
              if (sorted.length === 0) return 0;
              if (sorted.length === 1) return sorted[0];
              const rank = 0.9 * (sorted.length - 1);
              const lo = Math.floor(rank);
              const hi = Math.ceil(rank);
              const frac = rank - lo;
              return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
            })();
            const p90Label = p90 >= 10 ? `${Math.round(p90)}h` : `${p90.toFixed(1)}h`;
            const total = responseTimes.length;
            const responded = nonZero.length;
            const slowCount = nonZero.filter((v) => v > 6).length;
            const tooltip = `${responded} de ${total} cutucadas tiveram resposta. Mediana: ${medianLabel} · p90: ${p90Label}. Verde <1h · Amarelo 1-6h · Vermelho >6h`;
            return (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-warning/80">
                    Tempo médio de resposta (h) — últimas {responseTimes.length}
                  </p>
                  <div className="flex items-center gap-1">
                    {slowCount > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex cursor-pointer items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-destructive transition hover:bg-destructive/20"
                            title={`${slowCount} cutucada${slowCount !== 1 ? "s" : ""} com resposta acima de 6h. Clique para ver quem.`}
                          >
                            🐌 {slowCount} lenta{slowCount !== 1 ? "s" : ""}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 p-0">
                          <div className="border-b border-border bg-destructive/5 px-3 py-2">
                            <p className="text-[11px] font-bold text-destructive">🐌 Respostas lentas (&gt;6h)</p>
                            <p className="text-[10px] text-muted-foreground">
                              {slowResponders.length === 0
                                ? "Nenhum detalhe disponível."
                                : `${slowResponders.length} resposta${slowResponders.length !== 1 ? "s" : ""} de destinatários — ordenado da mais lenta.`}
                            </p>
                          </div>
                          <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                            {slowResponders.length === 0 ? (
                              <li className="px-3 py-3 text-[11px] text-muted-foreground">
                                Sem dados detalhados disponíveis.
                              </li>
                            ) : (() => {
                              // Group by user_id, sort users by count DESC then by max hours DESC.
                              const grouped = new Map<string, typeof slowResponders>();
                              for (const s of slowResponders) {
                                const arr = grouped.get(s.userId) || [];
                                arr.push(s);
                                grouped.set(s.userId, arr);
                              }
                              const userGroups = Array.from(grouped.entries())
                                .map(([userId, items]) => ({
                                  userId,
                                  items: items.slice().sort((a, b) => b.hours - a.hours),
                                  maxHours: Math.max(...items.map((i) => i.hours)),
                                  avgHours: items.reduce((s, i) => s + i.hours, 0) / items.length,
                                }))
                                .sort((a, b) => b.items.length - a.items.length || b.maxHours - a.maxHours);
                              return userGroups.map(({ userId, items, maxHours, avgHours }) => {
                                const name = actorNames[userId] || "Usuário";
                                const isOpen2 = !!slowGroupedExpanded[userId];
                                const avgLbl = avgHours >= 10 ? `${Math.round(avgHours)}h` : `${avgHours.toFixed(1)}h`;
                                const maxLbl = maxHours >= 10 ? `${Math.round(maxHours)}h` : `${maxHours.toFixed(1)}h`;
                                const tone =
                                  maxHours > 24 ? "text-destructive" : maxHours > 12 ? "text-destructive/80" : "text-warning";
                                return (
                                  <li key={userId} className="text-[11px]">
                                    <button
                                      type="button"
                                      onClick={() => setSlowGroupedExpanded((p) => ({ ...p, [userId]: !p[userId] }))}
                                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-muted/30"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-foreground">
                                          {name} <span className="font-normal text-muted-foreground">— {items.length} resposta{items.length !== 1 ? "s" : ""} lenta{items.length !== 1 ? "s" : ""}</span>
                                        </p>
                                        <p className="text-[9px] text-muted-foreground">
                                          média {avgLbl} · pior {maxLbl}
                                        </p>
                                      </div>
                                      <span className={`shrink-0 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${tone}`}>
                                        {items.length}×
                                      </span>
                                      {isOpen2 ? (
                                        <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" />
                                      ) : (
                                        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                                      )}
                                    </button>
                                    {isOpen2 && (
                                      <ul className="space-y-1 border-t border-border/50 bg-muted/10 px-3 py-2">
                                        {items.map((s, i) => {
                                          const hLabel = s.hours >= 10 ? `${Math.round(s.hours)}h` : `${s.hours.toFixed(1)}h`;
                                          const itemTone =
                                            s.hours > 24 ? "text-destructive" : s.hours > 12 ? "text-destructive/80" : "text-warning";
                                          return (
                                            <li key={`${s.nudgeAt}-${i}`} className="flex items-center justify-between gap-2 text-[10px]">
                                              <span className="text-muted-foreground">
                                                {s.roundNumber != null ? `Rodada #${s.roundNumber}` : "Rodada"} · {new Date(s.nudgeAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                                              </span>
                                              <span className={`tabular-nums font-bold ${itemTone}`}>{hLabel}</span>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}
                                  </li>
                                );
                              });
                            })()}
                          </ul>
                        </PopoverContent>
                      </Popover>
                    )}
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
                          className={`flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${toneCls}`}
                          title={tooltip}
                        >
                          <Clock className="h-2.5 w-2.5" /> Média geral: {avgLabel}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <Sparkline
                  values={responseTimes}
                  unit="h"
                  medianLine={median > 0 ? median : undefined}
                  p90Line={p90 > 0 ? p90 : undefined}
                  pointLabels={responseTimeLabels}
                />
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
