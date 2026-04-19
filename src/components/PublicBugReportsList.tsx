import { useEffect, useState, useCallback } from "react";
import { ArrowBigUp, Loader2, Bug, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

type PublicBugReport = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  vote_count: number;
  user_voted: boolean;
};

const STATUS_META: Record<
  string,
  { label: string; icon: React.ReactNode; cls: string }
> = {
  open: {
    label: "Aberto",
    icon: <AlertCircle className="h-3 w-3" />,
    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  in_progress: {
    label: "Em andamento",
    icon: <Clock className="h-3 w-3" />,
    cls: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  },
  resolved: {
    label: "Resolvido",
    icon: <CheckCircle2 className="h-3 w-3" />,
    cls: "bg-primary/15 text-primary border-primary/30",
  },
  wont_fix: {
    label: "Não será corrigido",
    icon: <AlertCircle className="h-3 w-3" />,
    cls: "bg-muted text-muted-foreground border-border",
  },
};

export function PublicBugReportsList() {
  const { user } = useAuth();
  const [reports, setReports] = useState<PublicBugReport[] | null>(null);
  const [voting, setVoting] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Public reports only (excludes resolved old ones from clutter — show last 30 days OR open)
    const { data: reportsData, error } = await supabase
      .from("bug_reports")
      .select("id, title, description, status, priority, created_at")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      setReports([]);
      return;
    }

    const ids = (reportsData ?? []).map((r) => r.id);
    if (ids.length === 0) {
      setReports([]);
      return;
    }

    const { data: votesData } = await supabase
      .from("bug_report_votes")
      .select("bug_report_id, user_id")
      .in("bug_report_id", ids);

    const voteMap = new Map<string, { count: number; mine: boolean }>();
    (votesData ?? []).forEach((v) => {
      const cur = voteMap.get(v.bug_report_id) ?? { count: 0, mine: false };
      cur.count += 1;
      if (user && v.user_id === user.id) cur.mine = true;
      voteMap.set(v.bug_report_id, cur);
    });

    const merged: PublicBugReport[] = (reportsData ?? []).map((r) => ({
      ...r,
      vote_count: voteMap.get(r.id)?.count ?? 0,
      user_voted: voteMap.get(r.id)?.mine ?? false,
    }));
    merged.sort((a, b) => b.vote_count - a.vote_count);
    setReports(merged);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleVote(reportId: string, currentlyVoted: boolean) {
    if (!user) {
      toast.error("Faça login para votar em bugs.");
      return;
    }
    setVoting(reportId);
    try {
      if (currentlyVoted) {
        await supabase
          .from("bug_report_votes")
          .delete()
          .eq("bug_report_id", reportId)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("bug_report_votes")
          .insert({ bug_report_id: reportId, user_id: user.id });
      }
      // Optimistic update
      setReports((prev) =>
        prev
          ? prev.map((r) =>
              r.id === reportId
                ? {
                    ...r,
                    user_voted: !currentlyVoted,
                    vote_count: r.vote_count + (currentlyVoted ? -1 : 1),
                  }
                : r,
            )
          : prev,
      );
    } catch (e) {
      toast.error("Não foi possível registrar seu voto.");
    } finally {
      setVoting(null);
    }
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-5 lg:p-6">
      <div className="mb-4 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Bug className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg font-bold text-foreground">
            Bugs reportados pela comunidade
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Vote no que mais te incomoda — ajuda a priorizar as correções.
          </p>
        </div>
      </div>

      {reports === null && (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}

      {reports && reports.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Nenhum bug reportado ainda. 🎉
        </p>
      )}

      {reports && reports.length > 0 && (
        <ul className="space-y-2">
          {reports.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.open;
            return (
              <li
                key={r.id}
                className="flex items-start gap-3 rounded-2xl border border-border bg-background/50 p-3 transition-colors hover:border-primary/30"
              >
                <button
                  type="button"
                  onClick={() => toggleVote(r.id, r.user_voted)}
                  disabled={voting === r.id}
                  className={`flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-xl border px-2 py-1.5 text-xs font-bold transition-all ${
                    r.user_voted
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  } disabled:opacity-50`}
                  aria-label={r.user_voted ? "Remover voto" : "Eu também tenho esse bug"}
                >
                  {voting === r.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowBigUp
                      className={`h-5 w-5 ${r.user_voted ? "fill-primary" : ""}`}
                    />
                  )}
                  <span className="text-[11px] tabular-nums">{r.vote_count}</span>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}
                    >
                      {meta.icon}
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-foreground">{r.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {r.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
