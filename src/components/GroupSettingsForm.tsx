import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Globe, Lock, Save, Loader2, AlertTriangle, EyeOff, CheckCircle2, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { GroupImageUpload } from "@/components/GroupImageUpload";
import { useNavigate } from "@tanstack/react-router";

interface Props {
  groupId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  visibility?: string;
  maxPlayers: number;
  sport: string;
  simultaneousCourts: number;
  imageUrl: string | null;
  groupStatus?: string;
  isCreator?: boolean;
  presenceOpenMode?: string;
  presenceOpenTime?: string;
  onSaved: () => void;
}

export function GroupSettingsForm({
  groupId, name: initName, description: initDesc, isPublic: initPublic, visibility: initVisibility,
  maxPlayers, sport, simultaneousCourts, imageUrl, groupStatus = "active", isCreator = false,
  presenceOpenMode: initPresenceMode = "1_day_before", presenceOpenTime: initPresenceTime = "10:00:00",
  onSaved,
}: Props) {
  const navigate = useNavigate();
  const [name, setName] = useState(initName);
  const [description, setDescription] = useState(initDesc || "");
  const initialVis = initVisibility || (initPublic ? "public" : "private");
  const [visibility, setVisibility] = useState<string>(initialVis);
  const [presenceMode, setPresenceMode] = useState(initPresenceMode);
  const [presenceTime, setPresenceTime] = useState(initPresenceTime.slice(0, 5));
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasChanges = name !== initName || description !== (initDesc || "") || visibility !== initialVis
    || presenceMode !== initPresenceMode || presenceTime !== initPresenceTime.slice(0, 5);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("groups")
      .update({
        name: name.trim(),
        description: description.trim() || null,
        is_public: visibility === "public",
        visibility,
        presence_open_mode: presenceMode,
        presence_open_time: presenceTime + ":00",
      } as any)
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
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setVisibility("public")}
            className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-xs font-medium transition-colors ${
              visibility === "public" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
            }`}
          >
            <Globe className="h-4 w-4" />
            Público
          </button>
          <button
            onClick={() => setVisibility("private")}
            className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-xs font-medium transition-colors ${
              visibility === "private" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
            }`}
          >
            <Lock className="h-4 w-4" />
            Privado
          </button>
          <button
            onClick={() => setVisibility("hidden")}
            className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-xs font-medium transition-colors ${
              visibility === "hidden" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
            }`}
          >
            <EyeOff className="h-4 w-4" />
            Oculto
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {visibility === "public" && "Aparece em Explorar e qualquer pessoa pode ver tudo (membros, ranking, temporadas, resultados) antes de entrar."}
          {visibility === "private" && "Aparece em Explorar mas só membros veem o conteúdo. Entrada por convite ou aprovação."}
          {visibility === "hidden" && "Não aparece em Explorar. Só entra quem receber o link de convite direto."}
        </p>
      </div>

      {/* Presence opening config */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Abertura da lista de presença</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "always", label: "Sempre aberta" },
            { value: "same_day", label: "No mesmo dia" },
            { value: "1_day_before", label: "1 dia antes" },
            { value: "2_days_before", label: "2 dias antes" },
            { value: "random", label: "Aleatório" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPresenceMode(opt.value)}
              className={`rounded-2xl border p-2.5 text-xs font-medium transition-colors ${
                presenceMode === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {presenceMode === "always" && "A lista fica aberta assim que a rodada é criada."}
          {presenceMode === "same_day" && "A lista abre no dia do jogo no horário definido abaixo."}
          {presenceMode === "1_day_before" && "A lista abre 1 dia antes do jogo no horário definido abaixo."}
          {presenceMode === "2_days_before" && "A lista abre 2 dias antes do jogo no horário definido abaixo."}
          {presenceMode === "random" && "A lista abre em um horário aleatório entre 36h e 24h antes do jogo."}
        </p>

        {presenceMode !== "always" && presenceMode !== "random" && (
          <div className="mt-3">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Horário de abertura</label>
            <input
              type="time"
              value={presenceTime}
              onChange={(e) => setPresenceTime(e.target.value)}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
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

      {/* Group status management - only for creator */}
      {isCreator && (
        <div className="space-y-3 pt-4 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">Gerenciar grupo</h3>

          {groupStatus === "active" && (
            <>
              <button
                onClick={async () => {
                  await supabase.from("groups").update({ status: "finished" }).eq("id", groupId);
                  toast.success("Grupo marcado como concluído");
                  onSaved();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-3 text-sm font-medium text-foreground transition-colors active:bg-accent/30"
              >
                <CheckCircle2 className="h-4 w-4 text-success" />
                Marcar como concluído
              </button>
              <button
                onClick={async () => {
                  await supabase.from("groups").update({ status: "inactive" }).eq("id", groupId);
                  toast.success("Grupo desativado e oculto");
                  onSaved();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-3 text-sm font-medium text-muted-foreground transition-colors active:bg-accent/30"
              >
                <EyeOff className="h-4 w-4" />
                Desativar grupo
              </button>
            </>
          )}

          {(groupStatus === "inactive" || groupStatus === "finished") && (
            <button
              onClick={async () => {
                await supabase.from("groups").update({ status: "active" }).eq("id", groupId);
                toast.success("Grupo reativado!");
                onSaved();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 py-3 text-sm font-medium text-primary transition-colors active:bg-primary/10"
            >
              <CheckCircle2 className="h-4 w-4" />
              Reativar grupo
            </button>
          )}

          <button
            onClick={() => setShowDeleteDialog(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 py-3 text-sm font-medium text-destructive transition-colors active:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar grupo permanentemente
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteDialog(false)} />
          <div className="relative w-[90%] max-w-sm rounded-3xl border border-border bg-card p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <h3 className="font-display text-base font-bold text-foreground">Eliminar grupo?</h3>
              <p className="text-sm text-muted-foreground">
                Esta ação é <strong className="text-foreground">irreversível</strong>. Todos os dados do grupo 
                (temporadas, rodadas, partidas, ranking) serão perdidos permanentemente.
              </p>
              <p className="text-sm text-muted-foreground">
                💡 <strong className="text-foreground">Recomendação:</strong> desative o grupo em vez de eliminar. 
                Ele ficará oculto mas preservará todo o histórico.
              </p>
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setShowDeleteDialog(false)}
                  className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-foreground"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await supabase.from("groups").delete().eq("id", groupId);
                      toast.success("Grupo eliminado");
                      navigate({ to: "/groups" });
                    } catch {
                      toast.error("Erro ao eliminar grupo");
                    } finally {
                      setDeleting(false);
                      setShowDeleteDialog(false);
                    }
                  }}
                  disabled={deleting}
                  className="flex-1 rounded-2xl bg-destructive py-3 text-sm font-bold text-destructive-foreground disabled:opacity-50"
                >
                  {deleting ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
