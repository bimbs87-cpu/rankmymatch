import { useEffect, useMemo, useState } from "react";
import { X, UserCheck, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { confirmPresence } from "@/lib/round-actions";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId: string;
  groupId: string;
  /** user_ids that are already confirmed in this round — they will be hidden from the picker */
  alreadyConfirmedIds: string[];
  onAdded: () => void;
}

interface MemberOption {
  user_id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
}

/**
 * Admin-only dialog: pick one or more group members and mark them as
 * present (confirmed) in the round on their behalf. Useful when the
 * presence list is open at the courts and players ask the admin to add them.
 */
export function AdminAddPresenceDialog({
  open,
  onOpenChange,
  roundId,
  groupId,
  alreadyConfirmedIds,
  onAdded,
}: Props) {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: gm } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", groupId)
          .eq("status", "active");
        const ids = (gm || []).map((m) => m.user_id);
        if (!ids.length) {
          if (!cancelled) setMembers([]);
          return;
        }
        const { data: profs } = await supabase
          .from("user_profiles")
          .select("user_id, name, nickname, avatar_url")
          .in("user_id", ids);
        if (cancelled) return;
        const list: MemberOption[] = (profs || []).map((p) => ({
          user_id: p.user_id,
          name: p.name,
          nickname: p.nickname,
          avatar_url: p.avatar_url,
        }));
        list.sort((a, b) =>
          (a.nickname || a.name || "").localeCompare(b.nickname || b.name || "", "pt-BR")
        );
        setMembers(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, groupId]);

  const confirmedSet = useMemo(() => new Set(alreadyConfirmedIds), [alreadyConfirmedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (confirmedSet.has(m.user_id)) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.nickname || "").toLowerCase().includes(q)
      );
    });
  }, [members, confirmedSet, query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    let ok = 0;
    let fail = 0;
    for (const userId of selected) {
      try {
        await confirmPresence(roundId, userId);
        ok++;
      } catch (e) {
        console.error("admin confirm presence failed", userId, e);
        fail++;
      }
    }
    setSubmitting(false);
    if (ok > 0) {
      toast.success(
        ok === 1
          ? "1 jogador confirmado na lista"
          : `${ok} jogadores confirmados na lista`
      );
      onAdded();
      onOpenChange(false);
    }
    if (fail > 0) {
      toast.error(
        fail === 1
          ? "1 jogador não pôde ser confirmado"
          : `${fail} jogadores não puderam ser confirmados`
      );
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !submitting && onOpenChange(false)}
      />
      <div className="relative w-[92%] max-w-md rounded-3xl border border-border bg-card p-5 animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
        <button
          onClick={() => !submitting && onOpenChange(false)}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:text-foreground"
          disabled={submitting}
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
            <UserCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-foreground">
              Adicionar à lista
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Confirme presença em nome de quem está na quadra.
            </p>
          </div>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar membro…"
            className="w-full rounded-xl border border-border bg-muted/30 pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="-mx-1 flex-1 overflow-y-auto min-h-0 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-muted-foreground">
                {members.length === 0
                  ? "Nenhum membro ativo no grupo."
                  : query
                  ? "Nenhum membro corresponde à busca."
                  : "Todos os membros ativos já estão na lista."}
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((m) => {
                const isSelected = selected.has(m.user_id);
                return (
                  <li key={m.user_id}>
                    <button
                      type="button"
                      onClick={() => toggle(m.user_id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                        isSelected
                          ? "bg-primary/15 ring-1 ring-primary/40"
                          : "hover:bg-muted/40"
                      }`}
                    >
                      <PlayerAvatar
                        avatarUrl={m.avatar_url}
                        name={m.name}
                        size="md"
                        className="border border-border"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {m.nickname || m.name}
                        </p>
                        {m.nickname && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {m.name}
                          </p>
                        )}
                      </div>
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-bold ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-transparent"
                        }`}
                        aria-hidden
                      >
                        ✓
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-3 flex gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="flex-1 rounded-xl border border-border bg-muted px-3 py-2.5 text-xs font-semibold text-muted-foreground disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || selected.size === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Confirmando…
              </>
            ) : (
              <>
                <UserCheck className="h-3.5 w-3.5" />
                Confirmar
                {selected.size > 0 ? ` (${selected.size})` : ""}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
