import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ArrowLeft,
  Loader2,
  ShieldAlert,
  Save,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  Wrench,
  Rocket,
  Pencil,
  X,
  ArrowUpRight,
  Lightbulb,
  GitBranch,
  RefreshCw,
  Wand2,
  CheckSquare,
  Square,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/sobre-desenvolvimento/changelog-admin")({
  head: () => ({
    meta: [
      { title: "Publicar changelog — Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ChangelogAdminPage,
});

type ReleaseNote = {
  id: string;
  version: string;
  title: string;
  description: string | null;
  type: string;
  released_at: string;
  is_published: boolean;
};

const TYPES = [
  { id: "feature", label: "Novidade", icon: <Sparkles className="h-3 w-3" />, cls: "bg-primary/15 text-primary border-primary/30" },
  { id: "improvement", label: "Melhoria", icon: <Rocket className="h-3 w-3" />, cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  { id: "fix", label: "Correção", icon: <Wrench className="h-3 w-3" />, cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
] as const;

/** Bump the patch portion of a semver-ish "v0.28.2" → "v0.28.3". */
function bumpPatch(version: string): string {
  const m = version.trim().match(/^(v?)(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!m) return "v0.0.1";
  const [, prefix, maj, min, pat] = m;
  return `${prefix || "v"}${maj}.${min}.${Number(pat) + 1}`;
}

const GITHUB_OWNER = "bimbs87-cpu";
const GITHUB_REPO = "rankmymatch";
const GITHUB_BRANCH = "main";

type CommitSuggestion = {
  sha: string;
  title: string;
  description: string;
  type: "feature" | "improvement" | "fix";
  url: string;
  date: string;
};

/** Infer changelog type from commit message conventions. */
function inferType(msg: string): "feature" | "improvement" | "fix" {
  const m = msg.toLowerCase();
  if (/^(fix|bug|hotfix)[(:\s]/.test(m) || m.startsWith("fix ") || m.includes(" fix ")) return "fix";
  if (/^feat[(:\s]/.test(m) || m.startsWith("feature") || m.startsWith("add ")) return "feature";
  return "improvement";
}

/** Skip noisy commits that shouldn't appear as changelog suggestions. */
function isNoise(msg: string): boolean {
  const m = msg.toLowerCase().trim();
  if (!m) return true;
  if (m.startsWith("merge ")) return true;
  if (m.startsWith("revert ")) return true;
  if (/^(chore|ci|docs|style|refactor|test)[(:\s]/.test(m)) return true;
  if (m.includes("lovable")) return true; // auto-sync commits
  if (m.length < 8) return true;
  return false;
}

/** Strip conventional-commit prefix and capitalize. */
function cleanTitle(msg: string): string {
  const firstLine = msg.split("\n")[0].trim();
  const stripped = firstLine.replace(/^(feat|fix|chore|docs|style|refactor|test|perf|build|ci)(\([^)]*\))?:\s*/i, "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}


function ChangelogAdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [notes, setNotes] = useState<ReleaseNote[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ReleaseNote>>({});

  // New entry form
  const [draft, setDraft] = useState({
    version: "",
    title: "",
    description: "",
    type: "improvement" as "feature" | "improvement" | "fix",
    released_at: new Date().toISOString().slice(0, 10),
    is_published: true,
  });
  const [creating, setCreating] = useState(false);

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
      .from("release_notes")
      .select("id, version, title, description, type, released_at, is_published")
      .order("released_at", { ascending: false })
      .order("version", { ascending: false })
      .limit(300);
    setNotes((data ?? []) as ReleaseNote[]);
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  // Latest published version → used by Bump button
  const latestVersion = useMemo(() => {
    if (!notes) return null;
    const pub = notes.find((n) => n.is_published);
    return pub?.version ?? notes[0]?.version ?? null;
  }, [notes]);

  // Raw commits fetched from GitHub (kept so we can re-send to AI)
  type RawCommit = { sha: string; message: string; date: string; url: string };
  const [rawCommits, setRawCommits] = useState<RawCommit[]>([]);
  const [fetchingCommits, setFetchingCommits] = useState(false);
  const [commitsFetchedAt, setCommitsFetchedAt] = useState<Date | null>(null);

  // AI-grouped release entries (the actual user-friendly suggestions)
  type GroupedEntry = {
    id: string; // local id for selection
    type: "feature" | "improvement" | "fix";
    title: string;
    description: string;
    commit_shas: string[];
  };
  const [groupedEntries, setGroupedEntries] = useState<GroupedEntry[]>([]);
  const [grouping, setGrouping] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [bulkVersion, setBulkVersion] = useState("");

  // Suggestions = grouped entries not yet present in release_notes (by title)
  const suggestions = useMemo(() => {
    if (!notes) return groupedEntries;
    const existingTitles = new Set(notes.map((n) => n.title.trim().toLowerCase()));
    return groupedEntries.filter((s) => !existingTitles.has(s.title.trim().toLowerCase()));
  }, [notes, groupedEntries]);

  async function fetchCommitsFromGitHub() {
    setFetchingCommits(true);
    try {
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=${GITHUB_BRANCH}&per_page=50`;
      const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GitHub ${res.status}: ${body.slice(0, 120)}`);
      }
      const data = (await res.json()) as Array<{
        sha: string;
        html_url: string;
        commit: { message: string; author: { date: string } };
      }>;
      const parsed: RawCommit[] = data
        .filter((c) => !isNoise(c.commit?.message ?? ""))
        .map((c) => ({
          sha: c.sha.slice(0, 7),
          message: c.commit?.message ?? "",
          date: c.commit?.author?.date ?? "",
          url: c.html_url,
        }));
      setRawCommits(parsed);
      setCommitsFetchedAt(new Date());
      // Reset previous AI grouping when commits change
      setGroupedEntries([]);
      setSelectedIds(new Set());
      toast.success(`${parsed.length} commits relevantes encontrados`);
    } catch (e: any) {
      toast.error(`Falha ao buscar commits: ${e.message ?? "erro"}`);
    } finally {
      setFetchingCommits(false);
    }
  }

  async function groupWithAI() {
    if (rawCommits.length === 0) {
      toast.error("Busque commits primeiro");
      return;
    }
    setGrouping(true);
    try {
      const { data, error } = await supabase.functions.invoke("summarize-commits", {
        body: {
          commits: rawCommits.map((c) => ({ sha: c.sha, message: c.message, date: c.date })),
          latestVersion,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const entries = (data?.entries ?? []) as Array<Omit<GroupedEntry, "id">>;
      const withIds: GroupedEntry[] = entries.map((e, i) => ({
        ...e,
        id: `g${i}-${e.commit_shas?.[0] ?? i}`,
      }));
      setGroupedEntries(withIds);
      setSelectedIds(new Set(withIds.map((e) => e.id)));
      setBulkVersion(latestVersion ? bumpPatch(latestVersion) : "v0.0.1");
      toast.success(`${withIds.length} entradas geradas pela IA`);
    } catch (e: any) {
      toast.error(`IA falhou: ${e.message ?? "erro desconhecido"}`);
    } finally {
      setGrouping(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === suggestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suggestions.map((s) => s.id)));
    }
  }

  async function publishSelected() {
    const toPublish = suggestions.filter((s) => selectedIds.has(s.id));
    if (toPublish.length === 0) {
      toast.error("Selecione pelo menos uma entrada");
      return;
    }
    if (!bulkVersion.trim()) {
      toast.error("Informe a versão");
      return;
    }
    setBulkPublishing(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = toPublish.map((s) => ({
        version: bulkVersion.trim(),
        title: s.title.trim(),
        description: s.description.trim() || null,
        type: s.type,
        released_at: today,
        is_published: true,
      }));
      const { error } = await supabase.from("release_notes").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} entradas publicadas em ${bulkVersion.trim()}`);
      // Remove published from local state
      setGroupedEntries((prev) => prev.filter((g) => !selectedIds.has(g.id)));
      setSelectedIds(new Set());
      await load();
    } catch (e: any) {
      toast.error(`Erro ao publicar: ${e.message ?? "falha"}`);
    } finally {
      setBulkPublishing(false);
    }
  }

  function applySuggestion(s: GroupedEntry) {
    setDraft((d) => ({
      ...d,
      version: latestVersion ? bumpPatch(latestVersion) : "v0.0.1",
      title: s.title,
      description: s.description,
      type: s.type,
      released_at: new Date().toISOString().slice(0, 10),
      is_published: true,
    }));
    toast.success("Sugestão aplicada ao formulário");
  }



  function handleBumpVersion() {
    if (!latestVersion) {
      setDraft((d) => ({ ...d, version: "v0.0.1" }));
      toast.info("Primeira versão sugerida: v0.0.1");
      return;
    }
    const next = bumpPatch(latestVersion);
    setDraft((d) => ({ ...d, version: next }));
    toast.success(`Versão sugerida: ${next}`);
  }

  async function createNote() {
    if (!draft.version.trim() || !draft.title.trim()) {
      toast.error("Versão e título são obrigatórios");
      return;
    }
    setCreating(true);
    try {
      const { error } = await supabase.from("release_notes").insert({
        version: draft.version.trim(),
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        type: draft.type,
        released_at: draft.released_at,
        is_published: draft.is_published,
      });
      if (error) throw error;
      toast.success("Entrada publicada");
      setDraft({
        version: "",
        title: "",
        description: "",
        type: "improvement",
        released_at: new Date().toISOString().slice(0, 10),
        is_published: true,
      });
      await load();
    } catch (e: any) {
      toast.error(`Erro: ${e.message ?? "falha ao publicar"}`);
    } finally {
      setCreating(false);
    }
  }

  async function updateNote(id: string, patch: Partial<ReleaseNote>) {
    setSavingId(id);
    try {
      const { error } = await supabase.from("release_notes").update(patch).eq("id", id);
      if (error) throw error;
      setNotes((prev) => (prev ? prev.map((n) => (n.id === id ? { ...n, ...patch } : n)) : prev));
      toast.success("Atualizado.");
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setSavingId(null);
    }
  }

  function startEdit(n: ReleaseNote) {
    setEditingId(n.id);
    setEditDraft({
      version: n.version,
      title: n.title,
      description: n.description ?? "",
      type: n.type,
      released_at: n.released_at.slice(0, 10),
    });
  }

  async function saveEdit(id: string) {
    if (!editDraft.version?.toString().trim() || !editDraft.title?.toString().trim()) {
      toast.error("Versão e título são obrigatórios");
      return;
    }
    await updateNote(id, {
      version: String(editDraft.version).trim(),
      title: String(editDraft.title).trim(),
      description: editDraft.description ? String(editDraft.description).trim() || null : null,
      type: editDraft.type,
      released_at: editDraft.released_at,
    });
    setEditingId(null);
    setEditDraft({});
  }

  async function deleteNote(id: string) {
    if (!confirm("Apagar esta entrada do changelog?")) return;
    setSavingId(id);
    try {
      const { error } = await supabase.from("release_notes").delete().eq("id", id);
      if (error) throw error;
      setNotes((prev) => (prev ? prev.filter((n) => n.id !== id) : prev));
      toast.success("Removido.");
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
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
          <h1 className="mt-4 font-display text-xl font-bold text-foreground">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">Apenas administradores.</p>
          <Link to="/sobre-desenvolvimento" className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="flex items-center gap-3 px-5 pt-6 pb-4 lg:mx-auto lg:max-w-4xl lg:px-6">
        <Link
          to="/sobre-desenvolvimento"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-accent"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-lg font-bold text-foreground">Publicar changelog</h1>
          <p className="text-[11px] text-muted-foreground">
            Última versão publicada: <span className="font-mono">{latestVersion ?? "—"}</span>
          </p>
        </div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
          Admin
        </span>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-6 px-5 lg:px-6">
        {/* Suggestions from GitHub + AI grouping */}
        <section className="rounded-3xl border border-primary/30 bg-primary/5 p-4 lg:p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
              <Lightbulb className="h-4 w-4 text-primary" />
              Sugestões automáticas {suggestions.length > 0 && `(${suggestions.length})`}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={fetchCommitsFromGitHub}
                disabled={fetchingCommits}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-accent disabled:opacity-50"
              >
                {fetchingCommits ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {commitsFetchedAt ? `Atualizar (${rawCommits.length})` : "1. Buscar commits"}
              </button>
              <button
                type="button"
                onClick={groupWithAI}
                disabled={grouping || rawCommits.length === 0}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 disabled:opacity-40"
              >
                {grouping ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                2. Agrupar com IA
              </button>
            </div>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Lê os últimos 30 commits de{" "}
            <a
              href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-mono text-primary hover:underline"
            >
              <GitBranch className="h-3 w-3" />
              {GITHUB_OWNER}/{GITHUB_REPO}@{GITHUB_BRANCH}
            </a>{" "}
            e usa IA para agrupar em 3-5 entradas claras de release. Selecione as que quer publicar e clique em <strong>Publicar selecionados</strong>.
          </p>

          {rawCommits.length === 0 && !fetchingCommits && (
            <p className="rounded-lg border border-dashed border-border bg-background/50 p-3 text-center text-[11px] text-muted-foreground">
              Comece clicando em <strong>1. Buscar commits</strong>.
            </p>
          )}

          {rawCommits.length > 0 && groupedEntries.length === 0 && !grouping && (
            <p className="rounded-lg border border-dashed border-border bg-background/50 p-3 text-center text-[11px] text-muted-foreground">
              {rawCommits.length} commits prontos. Clique em <strong>2. Agrupar com IA</strong> para gerar entradas amigáveis.
            </p>
          )}

          {grouping && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-background/50 p-4 text-[11px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              IA analisando commits e gerando entradas…
            </div>
          )}

          {suggestions.length > 0 && (
            <>
              {/* Bulk action bar */}
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-background/60 p-2.5">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-bold text-foreground hover:bg-accent"
                >
                  {selectedIds.size === suggestions.length ? (
                    <CheckSquare className="h-3 w-3" />
                  ) : (
                    <Square className="h-3 w-3" />
                  )}
                  {selectedIds.size === suggestions.length ? "Desmarcar todas" : "Marcar todas"}
                </button>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Versão
                  </label>
                  <Input
                    value={bulkVersion}
                    onChange={(e) => setBulkVersion(e.target.value)}
                    placeholder={latestVersion ? bumpPatch(latestVersion) : "v0.0.1"}
                    className="h-8 w-28 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={publishSelected}
                  disabled={bulkPublishing || selectedIds.size === 0}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  {bulkPublishing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Publicar selecionados ({selectedIds.size})
                </button>
              </div>

              <ul className="space-y-2">
                {suggestions.map((s) => {
                  const meta = TYPES.find((t) => t.id === s.type) ?? TYPES[1];
                  const isSelected = selectedIds.has(s.id);
                  return (
                    <li
                      key={s.id}
                      className={`flex items-start gap-2 rounded-xl border p-2.5 transition-colors ${
                        isSelected ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSelect(s.id)}
                        className="mt-0.5 shrink-0 text-primary hover:opacity-80"
                        aria-label={isSelected ? "Desmarcar" : "Marcar"}
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <span
                        className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}
                      >
                        {meta.icon}
                        {meta.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground">{s.title}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                          {s.description}
                        </p>
                        {s.commit_shas.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                              Commits:
                            </span>
                            {s.commit_shas.map((sha) => {
                              const c = rawCommits.find((r) => r.sha === sha);
                              return (
                                <a
                                  key={sha}
                                  href={c?.url ?? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${sha}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded border border-border bg-background px-1 font-mono text-[9px] text-muted-foreground hover:text-primary"
                                >
                                  {sha}
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => applySuggestion(s)}
                        className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="Editar no formulário antes de publicar"
                      >
                        <ArrowUpRight className="inline h-3 w-3" /> Editar
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {groupedEntries.length > 0 && suggestions.length === 0 && (
            <p className="rounded-lg border border-dashed border-border bg-background/50 p-3 text-center text-[11px] text-muted-foreground">
              Todas as entradas já estão no changelog. 🎉
            </p>
          )}
        </section>


        {/* Create form */}
        <section className="rounded-3xl border border-border bg-card p-4 lg:p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
            <Plus className="h-4 w-4 text-primary" />
            Nova entrada
          </h2>

          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Versão (ex: v0.28.2)
              </label>
              <div className="flex gap-1.5">
                <Input
                  value={draft.version}
                  onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value }))}
                  placeholder={latestVersion ? bumpPatch(latestVersion) : "v0.0.1"}
                />
                <button
                  type="button"
                  onClick={handleBumpVersion}
                  className="shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2 text-[10px] font-bold text-primary hover:bg-primary/20"
                  title={latestVersion ? `Sugerir ${bumpPatch(latestVersion)}` : "Sugerir primeira versão"}
                >
                  Bump
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Data de release
              </label>
              <Input
                type="date"
                value={draft.released_at}
                onChange={(e) => setDraft((d) => ({ ...d, released_at: e.target.value }))}
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Título
              </label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Ex: Linha do tempo redesenhada"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Descrição (opcional)
              </label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Detalhes opcionais — aparecem após o título no changelog público."
                rows={2}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</label>
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, type: t.id as any }))}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      draft.type === t.id ? t.cls + " ring-1 ring-current" : "border-border bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={draft.is_published}
                  onChange={(e) => setDraft((d) => ({ ...d, is_published: e.target.checked }))}
                  className="h-4 w-4 rounded border-border"
                />
                Publicar imediatamente
              </label>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={createNote} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Publicar entrada
            </Button>
          </div>
        </section>

        {/* List */}
        <section>
          <h2 className="mb-2 px-1 font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Entradas existentes ({notes?.length ?? 0})
          </h2>
          {notes === null && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {notes && notes.length === 0 && (
            <p className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhuma entrada ainda.
            </p>
          )}
          <ul className="space-y-2">
            {(notes ?? []).map((n) => {
              const meta = TYPES.find((t) => t.id === n.type) ?? TYPES[1];
              const isEditing = editingId === n.id;
              return (
                <li key={n.id} className="rounded-2xl border border-border bg-card p-3 lg:p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                    <span className="rounded-full border border-border bg-background/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {n.version}
                    </span>
                    <span className="rounded-full border border-border bg-background/50 px-2 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                      {new Date(n.released_at).toLocaleDateString("pt-BR")}
                    </span>
                    {!n.is_published && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                        Rascunho
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {!isEditing ? (
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => startEdit(n)}
                          className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="Cancelar edição"
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft({});
                          }}
                          className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        title={n.is_published ? "Despublicar" : "Publicar"}
                        onClick={() => updateNote(n.id, { is_published: !n.is_published })}
                        disabled={savingId === n.id}
                        className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        {n.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        title="Apagar"
                        onClick={() => deleteNote(n.id)}
                        disabled={savingId === n.id}
                        className="rounded-md border border-destructive/30 bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {!isEditing ? (
                    <>
                      <p className="mt-1.5 font-bold text-foreground">{n.title}</p>
                      {n.description && (
                        <p className="mt-0.5 text-[12px] text-muted-foreground">{n.description}</p>
                      )}
                    </>
                  ) : (
                    <div className="mt-2 grid gap-2 lg:grid-cols-3">
                      <div className="lg:col-span-1">
                        <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Versão
                        </label>
                        <Input
                          value={String(editDraft.version ?? "")}
                          onChange={(e) => setEditDraft((d) => ({ ...d, version: e.target.value }))}
                        />
                      </div>
                      <div className="lg:col-span-1">
                        <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Data
                        </label>
                        <Input
                          type="date"
                          value={String(editDraft.released_at ?? "").slice(0, 10)}
                          onChange={(e) => setEditDraft((d) => ({ ...d, released_at: e.target.value }))}
                        />
                      </div>
                      <div className="lg:col-span-1">
                        <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Tipo
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {TYPES.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setEditDraft((d) => ({ ...d, type: t.id }))}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                                editDraft.type === t.id
                                  ? t.cls + " ring-1 ring-current"
                                  : "border-border bg-background text-muted-foreground"
                              }`}
                            >
                              {t.icon}
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="lg:col-span-3">
                        <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Título
                        </label>
                        <Input
                          value={String(editDraft.title ?? "")}
                          onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                        />
                      </div>
                      <div className="lg:col-span-3">
                        <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Descrição
                        </label>
                        <Textarea
                          value={String(editDraft.description ?? "")}
                          onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                          rows={2}
                        />
                      </div>
                      <div className="lg:col-span-3 flex justify-end">
                        <Button size="sm" onClick={() => saveEdit(n.id)} disabled={savingId === n.id}>
                          {savingId === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Salvar alterações
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
