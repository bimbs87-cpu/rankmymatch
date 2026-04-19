import { useEffect, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
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

export function AuditPanel({ groupId }: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [actorNames, setActorNames] = useState<Record<string, string>>({});

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
      // Resolve actor names
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
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const actions = Array.from(new Set(rows.map((r) => r.action))).sort();
  const filtered = filter === "all" ? rows : rows.filter((r) => r.action === filter);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 font-display text-base font-bold text-foreground">
          <ScrollText className="h-4 w-4" /> Auditoria
        </h3>
        <p className="text-xs text-muted-foreground">
          Últimos 50 eventos registrados para o grupo. Use para rastrear ações administrativas.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Filtrar:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">Todas as ações ({rows.length})</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a] || a}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/10 p-4 text-center text-xs text-muted-foreground">
          Nenhum evento registrado{filter !== "all" ? " para esta ação" : ""}.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const label = ACTION_LABELS[r.action] || r.action;
            const actor = actorNames[r.user_id] || "Usuário";
            return (
              <li key={r.id} className="rounded-xl border border-border bg-background/40 p-3">
                <div className="flex items-start justify-between gap-2">
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
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
