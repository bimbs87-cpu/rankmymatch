/**
 * Histórico de aprovações/rejeições de resultados nos últimos 30 dias.
 * Mostra: quem submeteu, quando, quem revisou, status e motivo da rejeição.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";

interface Row {
  id: string;
  match_id: string;
  status: "pending" | "approved" | "rejected";
  sets: { setNumber: number; scoreA: number; scoreB: number }[];
  submitted_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  match_number: number | null;
  round_number: number | null;
  scheduled_date: string | null;
  submitter?: { name: string; nickname: string | null; avatar_url: string | null };
  reviewer?: { name: string; nickname: string | null; avatar_url: string | null };
}

export function ApprovalHistoryPanel({ groupId }: { groupId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "approved" | "rejected" | "pending">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Get match ids in this group
        const { data: matches } = await supabase
          .from("matches")
          .select("id, match_number, rounds!inner(round_number, scheduled_date, group_id)")
          .eq("rounds.group_id", groupId);
        const matchIds = (matches || []).map((m: any) => m.id);
        if (!matchIds.length) {
          if (!cancelled) { setRows([]); setLoading(false); }
          return;
        }
        const matchMeta = new Map<string, { match_number: number | null; round_number: number | null; scheduled_date: string | null }>();
        (matches || []).forEach((m: any) => {
          matchMeta.set(m.id, {
            match_number: m.match_number,
            round_number: m.rounds?.round_number ?? null,
            scheduled_date: m.rounds?.scheduled_date ?? null,
          });
        });

        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: pending } = await supabase
          .from("pending_match_results")
          .select("*")
          .in("match_id", matchIds)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(100);

        const list = (pending || []) as any[];
        const userIds = Array.from(new Set([
          ...list.map((r) => r.submitted_by),
          ...list.map((r) => r.reviewed_by).filter(Boolean),
        ])) as string[];

        let profiles = new Map<string, any>();
        if (userIds.length) {
          const { data: profs } = await supabase
            .from("user_profiles")
            .select("user_id, name, nickname, avatar_url")
            .in("user_id", userIds);
          (profs || []).forEach((p: any) => profiles.set(p.user_id, p));
        }

        const out: Row[] = list.map((r) => {
          const meta = matchMeta.get(r.match_id) || { match_number: null, round_number: null, scheduled_date: null };
          return {
            id: r.id,
            match_id: r.match_id,
            status: r.status,
            sets: (r.sets || []) as Row["sets"],
            submitted_by: r.submitted_by,
            reviewed_by: r.reviewed_by,
            reviewed_at: r.reviewed_at,
            review_note: r.review_note,
            created_at: r.created_at,
            match_number: meta.match_number,
            round_number: meta.round_number,
            scheduled_date: meta.scheduled_date,
            submitter: profiles.get(r.submitted_by),
            reviewer: r.reviewed_by ? profiles.get(r.reviewed_by) : undefined,
          };
        });

        if (!cancelled) setRows(out);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  const counts = {
    all: rows.length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    pending: rows.filter((r) => r.status === "pending").length,
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-base font-bold text-foreground">Aprovações de resultados</h3>
        <p className="text-xs text-muted-foreground">Últimos 30 dias — quem submeteu e quem revisou.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { id: "all", label: "Todos" },
          { id: "pending", label: "Pendentes" },
          { id: "approved", label: "Aprovados" },
          { id: "rejected", label: "Rejeitados" },
        ] as const).map((opt) => {
          const active = filter === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent/40"
              }`}
            >
              {opt.label}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground">
                {counts[opt.id]}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/30" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/10 py-10 text-center text-xs text-muted-foreground">
          Nenhum resultado {filter === "all" ? "" : filter === "approved" ? "aprovado" : filter === "rejected" ? "rejeitado" : "pendente"} nos últimos 30 dias.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    <span className="text-[11px] text-muted-foreground">
                      {r.round_number ? `Rodada ${r.round_number} · ` : ""}
                      Partida {r.match_number ?? "?"}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Placar:</span>
                    {r.sets.map((s, i) => (
                      <span key={i} className="rounded-md bg-muted px-1.5 py-0.5 font-mono font-bold text-foreground">
                        {s.scoreA}-{s.scoreB}
                      </span>
                    ))}
                  </div>

                  <div className="mt-2 grid gap-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <PlayerAvatar
                        avatarUrl={r.submitter?.avatar_url || null}
                        name={r.submitter?.nickname || r.submitter?.name || "?"}
                        size="sm"
                        className="!h-4 !w-4"
                      />
                      <span>
                        Enviado por <span className="font-semibold text-foreground">{r.submitter?.nickname || r.submitter?.name || "Jogador"}</span>
                        {" · "}
                        {formatRelative(r.created_at)}
                      </span>
                    </div>
                    {r.reviewer && r.reviewed_at && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        {r.status === "approved" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        )}
                        <span>
                          {r.status === "approved" ? "Aprovado" : "Rejeitado"} por{" "}
                          <span className="font-semibold text-foreground">{r.reviewer.nickname || r.reviewer.name}</span>
                          {" · "}
                          {formatRelative(r.reviewed_at)}
                        </span>
                      </div>
                    )}
                  </div>

                  {r.status === "rejected" && r.review_note && (
                    <div className="mt-2 rounded-xl border border-destructive/20 bg-destructive/5 p-2 text-[11px] text-foreground">
                      <span className="font-semibold text-destructive">Motivo: </span>
                      {r.review_note}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
        <CheckCircle2 className="h-3 w-3" />
        Aprovado
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
        <XCircle className="h-3 w-3" />
        Rejeitado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-bold text-info">
      <Clock className="h-3 w-3" />
      Pendente
    </span>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `há ${days}d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
