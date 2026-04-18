import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Copy, MessageCircle, Loader2, Eye, Pencil, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface PlaceholderTarget {
  user_id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
  targets: PlaceholderTarget[]; // 1 or many
  onSent?: () => void;
}

const DEFAULT_TEMPLATES: { id: string; name: string; body: string }[] = [
  {
    id: "default",
    name: "Padrão",
    body:
      "Olá {nome}! 👋\n\n" +
      "Você já está jogando no grupo *{grupo}* no RankMyMatch, " +
      "mas ainda sem conta vinculada. Clique no link abaixo, faça login " +
      "e seu histórico será automaticamente vinculado à sua conta:\n\n" +
      "{link}\n\n" +
      "🏆 Veja seu ranking, estatísticas e próximas partidas!",
  },
  {
    id: "short",
    name: "Curto",
    body:
      "Oi {nome}! 🎾 Vincule sua conta no *{grupo}*:\n{link}",
  },
  {
    id: "formal",
    name: "Formal",
    body:
      "Olá, {nome}.\n\n" +
      "Convido você a vincular sua conta ao grupo {grupo} no RankMyMatch. " +
      "Acesse o link abaixo para concluir o processo:\n\n{link}\n\n" +
      "Atenciosamente.",
  },
  {
    id: "fun",
    name: "Engraçado",
    body:
      "Eitcha {nome}! 🔥\n\n" +
      "Tá jogando bonito no *{grupo}* mas seu ranking tá voando sozinho 😂\n" +
      "Clica aí pra puxar tudo pra sua conta:\n\n{link}\n\n" +
      "Bora ver quem manda na quadra! 💪🎾",
  },
];

const STORAGE_TEMPLATES_KEY = "claim_invite_templates_v2";
const STORAGE_SELECTED_KEY = "claim_invite_selected_template_v2";

interface SavedTemplate { id: string; name: string; body: string }

function loadTemplates(): SavedTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_TEMPLATES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_TEMPLATES;
}

function saveTemplates(list: SavedTemplate[]) {
  try { localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 10; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function applyTemplate(tpl: string, name: string, group: string, link: string) {
  return tpl
    .replace(/\{nome\}/g, name)
    .replace(/\{grupo\}/g, group)
    .replace(/\{link\}/g, link);
}

export function ClaimInviteShareDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
  targets,
  onSent,
}: Props) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<SavedTemplate[]>(DEFAULT_TEMPLATES);
  const [selectedId, setSelectedId] = useState<string>("default");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<Record<string, string>>({});

  const isBulk = targets.length > 1;
  const sample = targets[0];

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) || templates[0],
    [templates, selectedId],
  );
  const template = selected?.body || "";

  // Load saved templates + selection
  useEffect(() => {
    if (!open) return;
    setEditing(false);
    setGeneratedLinks({});
    const list = loadTemplates();
    setTemplates(list);
    try {
      const sel = localStorage.getItem(STORAGE_SELECTED_KEY);
      if (sel && list.some((t) => t.id === sel)) setSelectedId(sel);
      else setSelectedId(list[0].id);
    } catch {
      setSelectedId(list[0].id);
    }
  }, [open]);

  const updateBody = (body: string) => {
    setTemplates((prev) => prev.map((t) => (t.id === selectedId ? { ...t, body } : t)));
  };

  const persist = () => {
    saveTemplates(templates);
    try { localStorage.setItem(STORAGE_SELECTED_KEY, selectedId); } catch { /* ignore */ }
    setEditing(false);
    toast.success("Modelo salvo");
  };

  const resetCurrentToDefault = () => {
    const def = DEFAULT_TEMPLATES.find((t) => t.id === selectedId);
    if (def) {
      setTemplates((prev) => prev.map((t) => (t.id === selectedId ? { ...t, body: def.body } : t)));
      toast.success("Restaurado para o padrão");
    } else {
      toast.info("Modelo personalizado — sem padrão para restaurar");
    }
  };

  const addTemplate = () => {
    const name = prompt("Nome do novo modelo:")?.trim();
    if (!name) return;
    const id = `custom_${Date.now()}`;
    const next = [...templates, { id, name, body: DEFAULT_TEMPLATES[0].body }];
    setTemplates(next);
    saveTemplates(next);
    setSelectedId(id);
    setEditing(true);
    try { localStorage.setItem(STORAGE_SELECTED_KEY, id); } catch { /* ignore */ }
  };

  const deleteCurrent = () => {
    if (templates.length <= 1) { toast.error("Mantenha pelo menos um modelo"); return; }
    if (!confirm(`Excluir modelo "${selected?.name}"?`)) return;
    const next = templates.filter((t) => t.id !== selectedId);
    setTemplates(next);
    saveTemplates(next);
    setSelectedId(next[0].id);
    try { localStorage.setItem(STORAGE_SELECTED_KEY, next[0].id); } catch { /* ignore */ }
  };

  const previewMessage = useMemo(() => {
    if (!sample) return "";
    const link = `${window.location.origin}/invite/EXEMPLO123`;
    return applyTemplate(template, sample.name, groupName || "RankMyMatch", link);
  }, [template, sample, groupName]);

  // WhatsApp soft limit ~4096 chars per message; warn well before.
  const charCount = previewMessage.length;
  const WA_SOFT_LIMIT = 1000; // recomendado para evitar truncamento visual
  const WA_HARD_LIMIT = 4096;
  const charTone =
    charCount > WA_HARD_LIMIT ? "text-destructive"
    : charCount > WA_SOFT_LIMIT ? "text-warning"
    : "text-muted-foreground";
  const charLabel =
    charCount > WA_HARD_LIMIT ? "Muito longa para WhatsApp"
    : charCount > WA_SOFT_LIMIT ? "Longa — pode aparecer truncada"
    : "OK";

  // Generate or reuse a claim invite for one placeholder. Returns the URL.
  const ensureInviteFor = async (placeholderUserId: string): Promise<string> => {
    if (!user) throw new Error("not authed");
    // Reuse an existing usable claim invite for this placeholder
    const { data: existing } = await supabase
      .from("invite_links")
      .select("code, use_count, max_uses, expires_at, is_active")
      .eq("group_id", groupId)
      .eq("claim_placeholder_user_id", placeholderUserId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isUsable = !!existing
      && existing.is_active
      && existing.use_count < (existing.max_uses ?? 1)
      && (!existing.expires_at || new Date(existing.expires_at) > new Date());

    let code: string;
    if (isUsable && existing) {
      code = existing.code;
    } else {
      code = generateCode();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const { error: insertErr } = await supabase.from("invite_links").insert({
        group_id: groupId,
        code,
        created_by: user.id,
        max_uses: 1,
        expires_at: expiresAt.toISOString(),
        claim_placeholder_user_id: placeholderUserId,
      } as never);
      if (insertErr) throw insertErr;
    }
    return `${window.location.origin}/invite/${code}`;
  };

  const buildAllMessages = async () => {
    const links: Record<string, string> = {};
    for (const t of targets) {
      links[t.user_id] = await ensureInviteFor(t.user_id);
    }
    setGeneratedLinks(links);
    return links;
  };

  // Single send via WhatsApp / Web Share
  const handleSendSingle = async () => {
    if (!sample) return;
    setBusy(true);
    try {
      const url = await ensureInviteFor(sample.user_id);
      const message = applyTemplate(template, sample.name, groupName || "RankMyMatch", url);
      const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: `Convite para ${sample.name}`, text: message, url });
        } catch {
          window.open(waUrl, "_blank");
        }
      } else {
        window.open(waUrl, "_blank");
      }
      toast.success("Convite pronto para envio!");
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar convite");
    } finally {
      setBusy(false);
    }
  };

  // Bulk: build messages and copy them all to clipboard, separated.
  const handleBulkCopy = async () => {
    setBusy(true);
    try {
      const links = await buildAllMessages();
      const blocks = targets.map((t) => {
        const msg = applyTemplate(template, t.name, groupName || "RankMyMatch", links[t.user_id]);
        return `— ${t.name} —\n${msg}`;
      });
      const out = blocks.join("\n\n────────\n\n");
      await navigator.clipboard.writeText(out);
      toast.success(`${targets.length} convites copiados!`);
      onSent?.();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar convites");
    } finally {
      setBusy(false);
    }
  };

  // Bulk: open WhatsApp with a single broadcast-style message containing all links
  const handleBulkWhatsApp = async () => {
    setBusy(true);
    try {
      const links = await buildAllMessages();
      const intro = `🎾 *${groupName || "RankMyMatch"}* — convites de vinculação\n\nClique no SEU link para vincular sua conta:\n`;
      const lines = targets
        .map((t) => `• ${t.name}: ${links[t.user_id]}`)
        .join("\n");
      const full = `${intro}\n${lines}\n\nApós o login, seu histórico é vinculado automaticamente.`;
      const waUrl = `https://wa.me/?text=${encodeURIComponent(full)}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: "Convites de vinculação", text: full });
        } catch {
          window.open(waUrl, "_blank");
        }
      } else {
        window.open(waUrl, "_blank");
      }
      toast.success(`${targets.length} convites prontos!`);
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar convites");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl border-border bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-foreground">
            {isBulk ? `Convidar ${targets.length} jogadores` : `Convidar ${sample?.name ?? ""}`}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Mensagem com link único de vinculação automática (válido por 30 dias).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Targets summary (bulk) */}
          {isBulk && (
            <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-background p-2 max-h-24 overflow-y-auto">
              {targets.map((t) => (
                <span key={t.user_id} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
                  {t.name}
                </span>
              ))}
            </div>
          )}

          {/* Template selector */}
          <div className="flex items-center gap-2">
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                try { localStorage.setItem(STORAGE_SELECTED_KEY, e.target.value); } catch { /* ignore */ }
              }}
              className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              onClick={addTemplate}
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-1.5 text-[10px] font-semibold text-foreground hover:bg-muted/70"
              title="Novo modelo"
            >
              <Plus className="h-3 w-3" />
            </button>
            {templates.length > 1 && (
              <button
                onClick={deleteCurrent}
                className="rounded-full bg-destructive/10 px-2 py-1.5 text-destructive hover:bg-destructive/20"
                title="Excluir modelo"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Template editor / preview */}
          <div className="rounded-2xl border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                {editing ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {editing ? `Editando: ${selected?.name}` : `Pré-visualização: ${selected?.name}`}
              </span>
              {editing ? (
                <div className="flex gap-1">
                  <button onClick={resetCurrentToDefault} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Padrão
                  </button>
                  <button onClick={persist} className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                    <Check className="h-2.5 w-2.5" />Salvar
                  </button>
                </div>
              ) : (
                <button onClick={() => setEditing(true)} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
                  <Pencil className="h-2.5 w-2.5" />Editar
                </button>
              )}
            </div>

            {editing ? (
              <>
                <Textarea
                  value={template}
                  onChange={(e) => updateBody(e.target.value)}
                  rows={9}
                  className="resize-none border-border bg-card text-xs"
                  placeholder="Mensagem..."
                />
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Variáveis: <code className="text-foreground">{"{nome}"}</code>{" "}
                  <code className="text-foreground">{"{grupo}"}</code>{" "}
                  <code className="text-foreground">{"{link}"}</code>
                </p>
              </>
            ) : (
              <pre className="whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-2 text-[11px] leading-relaxed text-foreground font-sans max-h-48 overflow-y-auto">
                {previewMessage}
              </pre>
            )}

          {/* Char counter */}
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
              <span className={`font-semibold ${charTone}`}>
                {charCount} caracteres · {charLabel}
              </span>
              <div className="flex items-center gap-2">
                {charCount > WA_SOFT_LIMIT && selectedId !== "short" && (
                  <button
                    onClick={() => {
                      setSelectedId("short");
                      try { localStorage.setItem(STORAGE_SELECTED_KEY, "short"); } catch { /* ignore */ }
                      // Ensure "short" exists in current templates list (could have been deleted)
                      setTemplates((prev) => {
                        if (prev.some((t) => t.id === "short")) return prev;
                        const def = DEFAULT_TEMPLATES.find((t) => t.id === "short")!;
                        const next = [...prev, def];
                        saveTemplates(next);
                        return next;
                      });
                      setEditing(false);
                      toast.success("Modelo Curto aplicado");
                    }}
                    className="rounded-full bg-warning/20 px-2 py-0.5 font-bold text-warning hover:bg-warning/30"
                    title="Trocar para o modelo Curto"
                  >
                    ⚡ Encurtar automaticamente
                  </button>
                )}
                <span className="text-muted-foreground">
                  limite ~{WA_HARD_LIMIT}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          {isBulk ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                onClick={handleBulkWhatsApp}
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-xl bg-success py-2.5 text-sm font-bold text-success-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                WhatsApp
              </button>
              <button
                onClick={handleBulkCopy}
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                Copiar todos
              </button>
            </div>
          ) : (
            <button
              onClick={handleSendSingle}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-success py-2.5 text-sm font-bold text-success-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Enviar pelo WhatsApp
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
