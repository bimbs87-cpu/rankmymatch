import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft,
  Bug,
  Loader2,
  ShieldAlert,
  Save,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/sobre-desenvolvimento/admin")({
  head: () => ({
    meta: [
      { title: "Triagem de bugs — Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BugAdminPage,
});

type BugReport = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  route: string | null;
  user_agent: string | null;
  user_id: string | null;
  screenshot_url: string | null;
  admin_notes: string | null;
  is_public: boolean;
  created_at: string;
};

const STATUSES = ["open", "in_progress", "resolved", "wont_fix"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABELS: Record<Status, string> = {
  open: "Abertos",
  in_progress: "Em andamento",
  resolved: "Resolvidos",
  wont_fix: "Não corrigir",
};

const STATUS_ICONS: Record<Status, React.ReactNode> = {
  open: <AlertCircle className="h-3.5 w-3.5" />,
  in_progress: <Clock className="h-3.5 w-3.5" />,
  resolved: <CheckCircle2 className="h-3.5 w-3.5" />,
  wont_fix: <XCircle className="h-3.5 w-3.5" />,
};

function BugAdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [reports, setReports] = useState<BugReport[] | null>(null);
  const [filter, setFilter] = useState<Status>("open");
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Check admin status
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [user, authLoading, navigate]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase
      .from("bug_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setReports((data ?? []) as BugReport[]);
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateReport(
    id: string,
    patch: Partial<Pick<BugReport, "status" | "priority" | "admin_notes" | "is_public">>,
  ) {
    setSavingId(id);
    try {
      const { error } = await supabase
        .from("bug_reports")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
      setReports((prev) =>
        prev ? prev.map((r) => (r.id === id ? { ...r, ...patch } : r)) : prev,
      );
      toast.success("Atualizado.");
    } catch (e) {
      toast.error("Erro ao salvar.");
    } finally {
      setSavingId(null);
    }
  }

  if (authLoading || isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="mt-4 font-display text-xl font-bold text-foreground">
            Acesso restrito
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta página é exclusiva para administradores do RankMyMatch.
          </p>
          <Link
            to="/sobre-desenvolvimento"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </div>
    );
  }

  const filtered = (reports ?? []).filter((r) => r.status === filter);
  const counts = STATUSES.reduce(
    (acc, s) => {
      acc[s] = (reports ?? []).filter((r) => r.status === s).length;
      return acc;
    },
    {} as Record<Status, number>,
  );

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="flex items-center gap-3 px-5 pt-6 pb-4 lg:mx-auto lg:max-w-6xl lg:px-6">
        <Link
          to="/sobre-desenvolvimento"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-accent"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1 className="flex-1 font-display text-lg font-bold text-foreground">
          Triagem de bugs
        </h1>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
          Admin
        </span>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-5 px-5 lg:px-6">
        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === s
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {STATUS_ICONS[s]}
              {STATUS_LABELS[s]}
              <span className="ml-1 rounded-full bg-background/60 px-1.5 text-[10px] tabular-nums">
                {counts[s] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {reports === null && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {filtered.length === 0 && reports !== null && (
          <p className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhum bug com este status.
          </p>
        )}

        <ul className="space-y-3">
          {filtered.map((r) => (
            <li
              key={r.id}
              className="rounded-3xl border border-border bg-card p-4 lg:p-5"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  <Bug className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground">{r.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {r.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    {r.route && (
                      <span className="rounded-full border border-border bg-background/50 px-2 py-0.5 font-mono">
                        {r.route}
                      </span>
                    )}
                    <span className="rounded-full border border-border bg-background/50 px-2 py-0.5">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </span>
                    {r.user_id && (
                      <span className="rounded-full border border-border bg-background/50 px-2 py-0.5 font-mono">
                        {r.user_id.slice(0, 8)}
                      </span>
                    )}
                  </div>
                  {r.screenshot_url && (
                    <a
                      href={r.screenshot_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block"
                    >
                      <img
                        src={r.screenshot_url}
                        alt="Screenshot"
                        className="max-h-40 rounded-lg border border-border"
                      />
                    </a>
                  )}
                  {r.user_agent && (
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {r.user_agent}
                    </p>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="mt-4 grid gap-3 border-t border-border pt-3 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Status
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        onClick={() => updateReport(r.id, { status: s })}
                        disabled={savingId === r.id}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                          r.status === s
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:bg-accent"
                        } disabled:opacity-50`}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 pt-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={r.is_public}
                      onChange={(e) =>
                        updateReport(r.id, { is_public: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-border"
                    />
                    Visível publicamente na lista
                  </label>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Notas internas
                  </label>
                  <Textarea
                    value={draftNotes[r.id] ?? r.admin_notes ?? ""}
                    onChange={(e) =>
                      setDraftNotes((prev) => ({
                        ...prev,
                        [r.id]: e.target.value,
                      }))
                    }
                    placeholder="Notas para a equipe (não visível ao usuário)..."
                    rows={2}
                    className="mt-1.5"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={savingId === r.id || draftNotes[r.id] === undefined}
                    onClick={() =>
                      updateReport(r.id, {
                        admin_notes: draftNotes[r.id] ?? "",
                      })
                    }
                  >
                    {savingId === r.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Salvar notas
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
