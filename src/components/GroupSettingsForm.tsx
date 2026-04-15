import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Globe, Lock, Users, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { GroupImageUpload } from "@/components/GroupImageUpload";

interface Props {
  groupId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  maxPlayers: number;
  sport: string;
  simultaneousCourts: number;
  imageUrl: string | null;
  onSaved: () => void;
}

export function GroupSettingsForm({
  groupId, name: initName, description: initDesc, isPublic: initPublic,
  maxPlayers, sport, simultaneousCourts, imageUrl, onSaved,
}: Props) {
  const [name, setName] = useState(initName);
  const [description, setDescription] = useState(initDesc || "");
  const [isPublic, setIsPublic] = useState(initPublic);
  const [saving, setSaving] = useState(false);

  const hasChanges = name !== initName || description !== (initDesc || "") || isPublic !== initPublic;

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("groups")
      .update({ name: name.trim(), description: description.trim() || null, is_public: isPublic })
      .eq("id", groupId);

    if (error) { toast.error("Erro ao salvar"); }
    else { toast.success("Grupo atualizado!"); onSaved(); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <GroupImageUpload
        groupId={groupId}
        currentUrl={imageUrl}
        onUploaded={async (url) => {
          await supabase.from("groups").update({ image_url: url }).eq("id", groupId);
          toast.success("Imagem atualizada!");
          onSaved();
        }}
        onRemoved={async () => {
          await supabase.from("groups").update({ image_url: null }).eq("id", groupId);
          toast.success("Imagem removida");
          onSaved();
        }}
      />

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Nome do grupo *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Descrição</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
          rows={3}
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Visibilidade</label>
        <div className="flex gap-2">
          <button
            onClick={() => setIsPublic(true)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${
              isPublic ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
            }`}
          >
            <Globe className="h-4 w-4" />
            Público
          </button>
          <button
            onClick={() => setIsPublic(false)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${
              !isPublic ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
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

      <div className="rounded-2xl border border-border bg-card/50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Outras informações</h3>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>Esporte: <span className="capitalize">{sport}</span></p>
          <p>Máx. jogadores: {maxPlayers}</p>
          <p>Quadras simultâneas: {simultaneousCourts}</p>
        </div>
      </div>

      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      )}
    </div>
  );
}
