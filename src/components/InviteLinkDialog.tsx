import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Link2, Share2, Trash2, Loader2, Plus } from "lucide-react";
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

export function InviteLinkDialog({ open, onOpenChange, groupId, isAdmin }: InviteLinkDialogProps) {
  const { user } = useAuth();
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

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

    const { error } = await supabase.from("invite_links").insert({
      group_id: groupId,
      code,
      created_by: user.id,
    });

    if (error) {
      toast.error("Erro ao criar link");
    } else {
      toast.success("Link criado!");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border-border bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-foreground">
            Links de Convite
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Create button */}
          <button
            onClick={createLink}
            disabled={creating}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Criar novo link
          </button>

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
            links.map((link) => (
              <div
                key={link.id}
                className="flex items-center gap-2 rounded-2xl border border-border bg-background p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-foreground">
                    /invite/{link.code}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {link.use_count} uso{link.use_count !== 1 ? "s" : ""}
                    {link.max_uses > 0 ? ` / ${link.max_uses} máx` : ""}
                  </p>
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
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
