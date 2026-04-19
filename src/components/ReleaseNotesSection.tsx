import { useEffect, useState } from "react";
import { Sparkles, Wrench, Rocket, Loader2, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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
  { label: string; icon: React.ReactNode; cls: string }
> = {
  feature: {
    label: "Novidade",
    icon: <Sparkles className="h-3 w-3" />,
    cls: "bg-primary/15 text-primary border-primary/30",
  },
  improvement: {
    label: "Melhoria",
    icon: <Rocket className="h-3 w-3" />,
    cls: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  },
  fix: {
    label: "Correção",
    icon: <Wrench className="h-3 w-3" />,
    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
};

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function ReleaseNotesSection() {
  const [notes, setNotes] = useState<ReleaseNote[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("release_notes")
        .select("id, version, title, description, type, released_at")
        .eq("is_published", true)
        .order("released_at", { ascending: false })
        .limit(5);
      if (!active) return;
      if (error) {
        setError(true);
        setNotes([]);
        return;
      }
      setNotes(data ?? []);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="rounded-3xl border border-border bg-card p-5 lg:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Changelog · Novidades
        </h3>
        <span className="text-[10px] text-muted-foreground">
          Últimas 5 atualizações
        </span>
      </div>

      {notes === null && (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}

      {notes && notes.length === 0 && !error && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Nenhuma novidade publicada ainda.
        </p>
      )}

      {notes && notes.length > 0 && (
        <>
          <ol className="relative space-y-3 border-l border-border pl-4">
            {notes.map((n) => {
              const meta = TYPE_META[n.type] ?? TYPE_META.feature;
              return (
                <li key={n.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}
                    >
                      {meta.icon}
                      {meta.label}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {n.version}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      · {formatDate(n.released_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-foreground">{n.title}</p>
                  {n.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {n.description}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <Link
            to="/changelog"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            Ver mais
            <ArrowRight className="h-3 w-3" />
          </Link>
        </>
      )}
    </section>
  );
}
