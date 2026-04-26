import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Sparkles, Wrench, Rocket, Loader2, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { markReleasesSeen } from "@/hooks/use-new-releases";

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [
      { title: "Changelog completo — RankMyMatch" },
      {
        name: "description",
        content:
          "Todas as melhorias, novidades e correções do RankMyMatch desde o início.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ChangelogPage,
});

type ReleaseNote = {
  id: string;
  version: string;
  title: string;
  description: string | null;
  type: string;
  released_at: string;
};

const TYPE_META: Record<
  string,
  { label: string; icon: React.ReactNode; cls: string; dot: string }
> = {
  feature: {
    label: "NOV",
    icon: <Sparkles className="h-2.5 w-2.5" />,
    cls: "bg-primary/15 text-primary border-primary/30",
    dot: "bg-primary",
  },
  improvement: {
    label: "MEL",
    icon: <Rocket className="h-2.5 w-2.5" />,
    cls: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    dot: "bg-sky-400",
  },
  fix: {
    label: "FIX",
    icon: <Wrench className="h-2.5 w-2.5" />,
    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    dot: "bg-amber-400",
  },
};

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/i, "")
    .split(".")
    .map((p) => parseInt(p, 10) || 0);
}

function compareVersionsDesc(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function ChangelogPage() {
  const [notes, setNotes] = useState<ReleaseNote[] | null>(null);
  const [filter, setFilter] = useState<"all" | "feature" | "improvement" | "fix">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    markReleasesSeen();
    (async () => {
      const { data } = await supabase
        .from("release_notes")
        .select("id, version, title, description, type, released_at")
        .eq("is_published", true);
      const sorted = ((data ?? []) as ReleaseNote[]).sort((a, b) =>
        compareVersionsDesc(a.version, b.version),
      );
      setNotes(sorted);
    })();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (notes ?? []).filter((n) => {
        if (filter !== "all" && n.type !== filter) return false;
        if (!normalizedQuery) return true;
        const haystack = `${n.title} ${n.description ?? ""} ${n.version}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      }),
    [notes, filter, normalizedQuery],
  );

  // Group by major.minor version (e.g. "0.28")
  const grouped = filtered.reduce(
    (acc, n) => {
      const [maj, min] = parseVersion(n.version);
      const key = `${maj}.${min}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(n);
      return acc;
    },
    {} as Record<string, ReleaseNote[]>,
  );

  // Sort items within each group by released_at desc, then version desc
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => {
      const dt = new Date(b.released_at).getTime() - new Date(a.released_at).getTime();
      if (dt !== 0) return dt;
      return compareVersionsDesc(a.version, b.version);
    });
  }

  const groupedEntries = Object.entries(grouped).sort(([a], [b]) =>
    compareVersionsDesc(a, b),
  );

  const versionLabel = (key: string) => `v${key}.x`;

  const counts = {
    all: notes?.length ?? 0,
    feature: (notes ?? []).filter((n) => n.type === "feature").length,
    improvement: (notes ?? []).filter((n) => n.type === "improvement").length,
    fix: (notes ?? []).filter((n) => n.type === "fix").length,
  };

  const FILTERS: Array<{ id: typeof filter; label: string }> = [
    { id: "all", label: "Tudo" },
    { id: "feature", label: "Novidades" },
    { id: "improvement", label: "Melhorias" },
    { id: "fix", label: "Correções" },
  ];

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
          <h1 className="font-display text-lg font-bold text-foreground">Changelog</h1>
          <p className="text-[11px] text-muted-foreground">
            Toda a história do RankMyMatch
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-4 px-5 lg:px-6">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por palavra-chave (ex: ranking, push, duelo...)"
            className="w-full rounded-full border border-border bg-card py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === f.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {f.label}
              <span className="rounded-full bg-background/60 px-1.5 text-[10px] tabular-nums">
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>

        {notes === null && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {notes && filtered.length === 0 && (
          <p className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nada por aqui ainda.
          </p>
        )}

        {/* Grouped condensed list */}
        {notes && filtered.length > 0 && (
          <div className="space-y-5">
            {groupedEntries.map(([versionKey, items]) => (
              <section key={versionKey} className="rounded-3xl border border-border bg-card p-4 lg:p-5">
                <div className="mb-2 flex items-baseline justify-between border-b border-border pb-2">
                  <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
                    {versionLabel(versionKey)}
                  </h2>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {items.length} {items.length === 1 ? "item" : "itens"}
                  </span>
                </div>

                <ul className="divide-y divide-border/50">
                  {items.map((n) => {
                    const meta = TYPE_META[n.type] ?? TYPE_META.feature;
                    return (
                      <li
                        key={n.id}
                        className="flex items-start gap-2.5 py-1.5 text-[13px] leading-snug"
                      >
                        <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                        <span
                          className={`mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded border px-1 py-0 font-mono text-[9px] font-bold ${meta.cls}`}
                        >
                          {meta.icon}
                          {meta.label}
                        </span>
                        <span className="mt-0.5 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {formatDate(n.released_at)}
                        </span>
                        <span className="mt-0.5 shrink-0 font-mono text-[10px] text-muted-foreground">
                          {n.version}
                        </span>
                        <span className="flex-1 text-foreground">
                          {n.title}
                          {n.description && (
                            <span className="text-muted-foreground"> — {n.description}</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
