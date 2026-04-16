import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { createGroup } from "@/hooks/use-groups";
import { useNavigate } from "@tanstack/react-router";
import { X, Globe, Lock, Users } from "lucide-react";
import { toast } from "sonner";
import { GroupImageUpload } from "@/components/GroupImageUpload";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateGroupDialog({ open, onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const resetForm = () => {
    setName("");
    setDescription("");
    setIsPublic(true);
    setMaxPlayers(20);
    setImageUrl(null);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !user || submitting) return;

    setSubmitting(true);

    try {
      const group = await createGroup({
        name: name.trim(),
        description: description.trim(),
        is_public: isPublic,
        max_players: maxPlayers,
        sport: "padel",
        userId: user.id,
      });

      // Update image_url if uploaded
      if (imageUrl && group) {
        const { error: updateImageError } = await supabase
          .from("groups")
          .update({ image_url: imageUrl })
          .eq("id", group.id);

        if (updateImageError) throw updateImageError;
      }

      resetForm();
      onClose();
      toast.success("Grupo criado com sucesso!");
      navigate({ to: "/groups/$groupId", params: { groupId: group.id } });
    } catch (e: any) {
      console.error("Erro ao criar grupo:", e);
      toast.error(e?.message || "Erro ao criar grupo. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-card animate-in slide-in-from-bottom duration-300 sm:rounded-3xl max-h-[85vh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
          <h2 className="font-display text-lg font-bold text-foreground">Criar Grupo</h2>
          <button onClick={onClose} disabled={submitting} className="rounded-full bg-muted p-2 disabled:opacity-50">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">

        <div className="space-y-4">
          {/* Imagem */}
          <GroupImageUpload
            onUploaded={(url) => setImageUrl(url)}
            onRemoved={() => setImageUrl(null)}
          />

          {/* Nome */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Nome do grupo *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Elite Padel Club"
              maxLength={60}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Conte um pouco sobre o grupo..."
              maxLength={300}
              rows={2}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Visibilidade */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">Visibilidade</label>
            <div className="flex gap-2">
              <button
                onClick={() => setIsPublic(true)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${
                  isPublic
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                <Globe className="h-4 w-4" />
                Público
              </button>
              <button
                onClick={() => setIsPublic(false)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${
                  !isPublic
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                <Lock className="h-4 w-4" />
                Privado
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {isPublic ? "Qualquer um pode encontrar e entrar." : "Entrada somente por convite ou aprovação."}
            </p>
          </div>

          {/* Max Players */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              <Users className="mr-1 inline h-3.5 w-3.5" />
              Máximo de jogadores
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={4}
                max={100}
                step={2}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="w-10 text-center font-display text-lg font-bold text-foreground">{maxPlayers}</span>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
            className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "Criando..." : "Criar Grupo"}
          </button>
        </div>
      </div>
    </div>
  );
}
