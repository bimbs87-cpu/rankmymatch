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

  // Suggestions = known shipped entries not yet present in release_notes (by title)
  const suggestions = useMemo(() => {
    if (!notes) return [];
    const existingTitles = new Set(notes.map((n) => n.title.trim().toLowerCase()));
    return KNOWN_RECENT_SHIPPED.filter((s) => !existingTitles.has(s.title.trim().toLowerCase()));
  }, [notes]);

  function applySuggestion(s: (typeof KNOWN_RECENT_SHIPPED)[number]) {
    setDraft((d) => ({
      ...d,
      version: latestVersion ? bumpPatch(latestVersion) : s.version,
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
        {/* Suggestions */}
        {suggestions.length > 0 && (
          <section className="rounded-3xl border border-primary/30 bg-primary/5 p-4 lg:p-5">
            <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
              <Lightbulb className="h-4 w-4 text-primary" />
              Sugestões automáticas ({suggestions.length})
            </h2>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Recursos recém-implementados que ainda não estão no changelog. Clique para preencher o formulário automaticamente.
            </p>
            <ul className="space-y-2">
              {suggestions.map((s, i) => {
                const meta = TYPES.find((t) => t.id === s.type) ?? TYPES[1];
                return (
                  <li key={i} className="flex items-start gap-2 rounded-xl border border-border bg-card p-2.5">
                    <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{s.title}</p>
                      <p className="text-[11px] text-muted-foreground">{s.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => applySuggestion(s)}
                      className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/20"
                      title="Preencher formulário com esta sugestão"
                    >
                      <ArrowUpRight className="inline h-3 w-3" /> Usar
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

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
