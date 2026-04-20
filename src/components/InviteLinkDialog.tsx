import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Link2, Share2, Trash2, Loader2, Plus, Clock, Users, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface InviteLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  isAdmin: boolean;
}

interface InviteLink {
  id: string;
  code: string;
  use_count: number;
  max_uses: number | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const EXPIRATION_OPTIONS = [
  { label: "Sem expiração", value: null },
  { label: "1 hora", value: 1 },
  { label: "24 horas", value: 24 },
  { label: "7 dias", value: 168 },
  { label: "30 dias", value: 720 },
] as const;

const MAX_USES_OPTIONS = [
  { label: "Ilimitado", value: 0 },
  { label: "1 uso", value: 1 },
  { label: "5 usos", value: 5 },
  { label: "10 usos", value: 10 },
  { label: "25 usos", value: 25 },
  { label: "50 usos", value: 50 },
] as const;

export function InviteLinkDialog({ open, onOpenChange, groupId, isAdmin }: InviteLinkDialogProps) {
  const { user } = useAuth();
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [expirationHours, setExpirationHours] = useState<number | null>(null);
  const [maxUses, setMaxUses] = useState(0);

  useEffect(() => {
    if (open) loadLinks();
  }, [open]);

  const loadLinks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("invite_links")
      .select("id, code, use_count, max_uses, expires_at, is_active, created_at")
      .eq("group_id", groupId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    setLinks(data || []);
    setLoading(false);
  };

  const createLink = async () => {
    if (!user) return;
    setCreating(true);
    const code = generateCode();

    const insertData: {
      group_id: string;
      code: string;
      created_by: string;
      expires_at?: string;
      max_uses?: number;
    } = {
      group_id: groupId,
      code,
      created_by: user.id,
    };

    if (expirationHours !== null) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expirationHours);
      insertData.expires_at = expiresAt.toISOString();
    }

    if (maxUses > 0) {
      insertData.max_uses = maxUses;
    }

    const { error } = await supabase.from("invite_links").insert(insertData);

    if (error) {
      toast.error("Erro ao criar link");
    } else {
      toast.success("Link criado!");
      void import("@/lib/analytics").then(({ trackEvent }) =>
        trackEvent("invite_created", {
          group_id: groupId,
          max_uses: maxUses || null,
          expires_in_hours: expirationHours,
        }),
      );
      setShowOptions(false);
      setExpirationHours(null);
      setMaxUses(0);
      loadLinks();
    }
    setCreating(false);
  };

  const deleteLink = async (id: string) => {
    await supabase.from("invite_links").update({ is_active: false }).eq("id", id);
    toast.success("Link desativado");
    loadLinks();
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const shareLink = async (code: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Convite para grupo",
          text: "Entre no nosso grupo no RankMyMatch!",
          url,
        });
      } catch {
        copyLink(code);
      }
    } else {
      copyLink(code);
    }
  };

  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const exp = new Date(expiresAt);
    if (exp < new Date()) return "Expirado";
    const diff = exp.getTime() - Date.now();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return `${Math.floor(diff / 60000)}min restantes`;
    if (hours < 24) return `${hours}h restantes`;
    return `${Math.floor(hours / 24)}d restantes`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border-border bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-foreground">
            Links de Convite
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Create section */}
          <div className="space-y-2">
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="flex w-full items-center justify-between rounded-2xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary"
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Criar novo link
              </span>
              {showOptions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showOptions && (
              <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
                {/* Expiration */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Expiração
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPIRATION_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setExpirationHours(opt.value)}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                          expirationHours === opt.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max uses */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    Limite de usos
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {MAX_USES_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setMaxUses(opt.value)}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                          maxUses === opt.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={createLink}
                  disabled={creating}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Gerar link
                </button>
              </div>
            )}
          </div>

          {/* Links list */}
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : links.length === 0 ? (
            <div className="py-4 text-center">
              <Link2 className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">Nenhum link ativo</p>
            </div>
          ) : (
            links.map((link) => {
              const expiry = formatExpiry(link.expires_at);
              return (
                <div
                  key={link.id}
                  className="flex items-center gap-2 rounded-2xl border border-border bg-background p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-foreground">
                      /invite/{link.code}
                    </p>
                    <div className="flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                      <span>
                        {link.use_count} uso{link.use_count !== 1 ? "s" : ""}
                        {link.max_uses && link.max_uses > 0 ? ` / ${link.max_uses} máx` : ""}
                      </span>
                      {expiry && (
                        <span className={expiry === "Expirado" ? "text-destructive" : "text-warning"}>
                          {expiry}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => shareLink(link.code)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => copyLink(link.code)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => deleteLink(link.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
