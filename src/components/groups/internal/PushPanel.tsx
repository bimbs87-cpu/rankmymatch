import { useEffect, useMemo, useState } from "react";
import { Send, Loader2, Search, Users, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  groupId: string;
  groupName: string;
}

interface MemberRow {
  user_id: string;
  role: string;
  profile: { name: string; nickname: string | null; avatar_url: string | null; avatar_type: string | null } | null;
}

const PRESETS: { label: string; value: string }[] = [
  { label: "Quadra trocada", value: "Atenção: a quadra foi alterada. Confira a localização atualizada no app." },
  { label: "Horário alterado", value: "O horário da próxima rodada foi alterado. Verifique no app e confirme presença." },
  { label: "Confirmar presença", value: "Lembrete: confirme sua presença na próxima rodada o quanto antes." },
  { label: "Resultado pendente", value: "Você tem partidas com resultado pendente. Lance no app para atualizar o ranking." },
  { label: "Rodada cancelada", value: "A próxima rodada foi cancelada. Detalhes no grupo." },
  { label: "Mensagem do admin", value: "Mensagem do admin: " },
];

export function PushPanel({ groupId, groupName }: Props) {
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState(`${groupName}`);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: gm } = await supabase
        .from("group_members")
        .select("user_id, role")
        .eq("group_id", groupId)
        .eq("status", "active");
      const ids = (gm || []).map((m) => m.user_id);
      if (!ids.length) {
        if (!cancelled) { setMembers([]); setLoading(false); }
        return;
      }
      const { data: profs } = await supabase
        .from("user_profiles")
        .select("user_id, name, nickname, avatar_url, avatar_type, is_placeholder")
        .in("user_id", ids);
      const profMap = new Map((profs || []).map((p) => [p.user_id, p]));
      const rows: MemberRow[] = (gm || [])
        .map((m) => {
          const p = profMap.get(m.user_id) as any;
          // Skip placeholder players — they have no auth account / no device
          if (p?.is_placeholder) return null;
          return {
            user_id: m.user_id,
            role: m.role,
            profile: p
              ? { name: p.name, nickname: p.nickname, avatar_url: p.avatar_url, avatar_type: p.avatar_type }
              : null,
          };
        })
        .filter(Boolean) as MemberRow[];
      rows.sort((a, b) => (a.profile?.name || "").localeCompare(b.profile?.name || ""));
      if (!cancelled) { setMembers(rows); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const n = (m.profile?.name || "").toLowerCase();
      const nick = (m.profile?.nickname || "").toLowerCase();
      return n.includes(q) || nick.includes(q);
    });
  }, [members, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.user_id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((m) => next.delete(m.user_id));
      else filtered.forEach((m) => next.add(m.user_id));
      return next;
    });
  };
  const toggleOne = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const send = async () => {
    if (!user) return;
    if (!title.trim()) { toast.error("Título é obrigatório"); return; }
    if (!message.trim()) { toast.error("Mensagem é obrigatória"); return; }
    if (selected.size === 0) { toast.error("Selecione ao menos um destinatário"); return; }
    setSending(true);
    try {
      const { notifyUsers, describePushResult } = await import("@/lib/notify");
      const targets = Array.from(selected);
      // Include actor in push (so admin sees confirmation on own device)
      const includeActor = targets.includes(user.id);
      const ids = includeActor ? targets : [...targets, user.id];
      const push = await notifyUsers(
        ids,
        {
          groupId,
          actorId: includeActor ? "__none__" : user.id, // hack: prevent filtering when admin selected
          type: "admin_message",
          title: title.trim().slice(0, 80),
          body: message.trim().slice(0, 240),
          url: `/groups/${groupId}`,
          data: { groupId, kind: "admin_push" },
          tag: `admin_push:${groupId}:${Date.now()}`,
        },
        `/groups/${groupId}`,
      );
      if (push.error) toast.error("Falha ao enviar push", { description: describePushResult(push) });
      else if (push.sent === 0) toast.warning("Push enviado com problemas", { description: describePushResult(push) });
      else toast.success(`Push enviado para ${selected.size} membro${selected.size === 1 ? "" : "s"}`, {
        description: describePushResult(push),
      });
      setMessage("");
      setSelected(new Set());
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar push");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-base font-bold text-foreground">Enviar push</h3>
        <p className="text-xs text-muted-foreground">
          Envie uma notificação push direta para membros específicos do grupo. Use modelos prontos ou edite a mensagem.
        </p>
      </div>

      {/* Recipients */}
      <div className="rounded-2xl border border-border bg-background/40 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Users className="h-3.5 w-3.5 text-primary" />
            Destinatários
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
              {selected.size} selecionado{selected.size === 1 ? "" : "s"}
            </span>
          </div>
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground"
          >
            {allFilteredSelected ? "Limpar seleção" : "Selecionar todos"}
          </button>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar membro..."
            className="w-full rounded-xl border border-border bg-background py-2 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando membros...
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Nenhum membro encontrado.</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {filtered.map((m) => {
              const isSel = selected.has(m.user_id);
              return (
                <li key={m.user_id}>
                  <button
                    type="button"
                    onClick={() => toggleOne(m.user_id)}
                    className={`flex w-full items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors ${
                      isSel ? "border-primary/50 bg-primary/10" : "border-border bg-card/50 hover:bg-accent/40"
                    }`}
                  >
                    <PlayerAvatar
                      name={m.profile?.name || "?"}
                      nickname={m.profile?.nickname || undefined}
                      avatarUrl={m.profile?.avatar_url || undefined}
                      avatarType={m.profile?.avatar_type as any}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">
                        {m.profile?.name || "Sem nome"}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {m.role === "creator" ? "Criador" : m.role === "admin" ? "Admin" : "Membro"}
                      </p>
                    </div>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                      isSel ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                    }`}>
                      {isSel && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Title */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Título</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">{title.length}/80</p>
      </div>

      {/* Presets */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Modelos rápidos</label>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setMessage(p.value)}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Mensagem</label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={240}
          rows={4}
          placeholder="Escreva ou escolha um modelo acima..."
          className="rounded-xl"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">{message.length}/240</p>
      </div>

      <button
        type="button"
        disabled={sending || selected.size === 0 || !message.trim() || !title.trim()}
        onClick={send}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {sending ? "Enviando..." : `Enviar para ${selected.size || 0} membro${selected.size === 1 ? "" : "s"}`}
      </button>

      <p className="text-[10px] text-muted-foreground">
        Apenas membros com app instalado e notificações permitidas receberão. Você (admin) também recebe uma cópia para confirmação visual.
      </p>
    </div>
  );
}
