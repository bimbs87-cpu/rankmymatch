import { useState } from "react";
import { UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  adminUserId: string;
  onAdded: () => void;
}

export function AddPlaceholderPlayerDialog({ open, onOpenChange, groupId, adminUserId, onAdded }: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Digite o nome do jogador");
      return;
    }

    setLoading(true);
    try {
      // Generate a random UUID for the placeholder user
      const placeholderUserId = crypto.randomUUID();

      // Create placeholder profile
      const { error: profileError } = await supabase.from("user_profiles").insert({
        user_id: placeholderUserId,
        name: trimmed,
        nickname: "",
        avatar_url: null,
        avatar_type: "preset",
        is_placeholder: true,
        created_by_admin: adminUserId,
      });

      if (profileError) throw profileError;

      // Add as group member
      const { error: memberError } = await supabase.from("group_members").insert({
        group_id: groupId,
        user_id: placeholderUserId,
        role: "member",
        status: "active",
      });

      if (memberError) throw memberError;

      toast.success(`${trimmed} adicionado ao grupo`);
      setName("");
      onAdded();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao adicionar jogador");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-[90%] max-w-sm rounded-3xl border border-border bg-card p-6 animate-in zoom-in-95 duration-200">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <UserPlus className="h-7 w-7 text-primary" />
          </div>
          <h3 className="font-display text-base font-bold text-foreground">Adicionar jogador</h3>
          <p className="text-center text-xs text-muted-foreground">
            Adicione um jogador somente pelo nome. Ele poderá vincular sua conta depois.
          </p>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do jogador"
            className="w-full rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />

          <button
            onClick={handleAdd}
            disabled={loading || !name.trim()}
            className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Adicionando..." : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
