import { useEffect, useState } from "react";
import {
  Settings2, Bell, Users, Link2, AlertTriangle, Save, Loader2, Globe, Lock, EyeOff,
  CheckCircle2, Trash2, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { GroupImageUpload } from "@/components/GroupImageUpload";
import { InviteLinkDialog } from "@/components/InviteLinkDialog";
import { PlayerClaimsManager } from "@/components/PlayerClaimsManager";
import { GroupCardPreview } from "@/components/groups/GroupCardPreview";
import { InviteEngagementReport } from "@/components/groups/internal/InviteEngagementReport";
import { useGroupDetail, approveJoinRequest, rejectJoinRequest } from "@/hooks/use-groups";
import { useAuth } from "@/hooks/use-auth";

type Section = "general" | "presence" | "members" | "invites" | "engagement" | "advanced";

interface Props {
  group: any;
  isCreator: boolean;
  onSaved: () => void;
  onShareInvite: () => void;
  pendingRequestsCount: number;
}

const SECTIONS: { id: Section; label: string; icon: typeof Settings2 }[] = [
  { id: "general", label: "Geral", icon: Settings2 },
  { id: "presence", label: "Presença", icon: Bell },
  { id: "members", label: "Membros & vínculos", icon: Users },
  { id: "invites", label: "Convites", icon: Link2 },
  { id: "engagement", label: "Engajamento", icon: BarChart3 },
  { id: "advanced", label: "Avançado", icon: AlertTriangle },
];

export function AdminPanel({ group, isCreator, onSaved, pendingRequestsCount }: Props) {
  const [section, setSection] = useState<Section>("general");
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Administração</h2>
        <p className="text-xs text-muted-foreground">Configurações e gestão do grupo</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="rounded-2xl border border-border bg-card p-2 lg:sticky lg:top-4 lg:self-start">
          <ul className="space-y-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              const badge = s.id === "members" ? pendingRequestsCount : 0;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSection(s.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
                      active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{s.label}</span>
                    {badge > 0 && (
                      <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">{badge}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="rounded-2xl border border-border bg-card p-5">
          {section === "general" && <GeneralSection group={group} onSaved={onSaved} />}
          {section === "presence" && <PresenceSection group={group} onSaved={onSaved} />}
          {section === "members" && <MembersSection group={group} onSaved={onSaved} />}
          {section === "invites" && (
            <InvitesSection
              groupId={group.id}
              inviteOpen={inviteOpen}
              setInviteOpen={setInviteOpen}
            />
          )}
          {section === "engagement" && <InviteEngagementReport groupId={group.id} />}
          {section === "advanced" && (
            <AdvancedSection group={group} isCreator={isCreator} onSaved={onSaved} />
          )}
        </div>
      </div>
    </div>
  );
}

/* =============== GERAL: nome, descrição, imagem, visibilidade =============== */
function GeneralSection({ group, onSaved }: { group: any; onSaved: () => void }) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || "");
  const initVis = group.visibility || (group.is_public ? "public" : "private");
  const [visibility, setVisibility] = useState<string>(initVis);
  const [saving, setSaving] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumExpiresAt, setPremiumExpiresAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("group_subscriptions")
      .select("status, expires_at")
      .eq("group_id", group.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) { setIsPremium(false); setPremiumExpiresAt(null); return; }
        const active = data.status && data.status !== "free" && data.status !== "cancelled";
        const exp = data.expires_at ? new Date(data.expires_at) : null;
        const notExpired = !exp || exp > new Date();
        setIsPremium(Boolean(active && notExpired));
        setPremiumExpiresAt(exp);
      });
    return () => { cancelled = true; };
  }, [group.id]);

  const premiumDaysLeft = premiumExpiresAt
    ? Math.ceil((premiumExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const premiumExpiringSoon = isPremium && premiumDaysLeft != null && premiumDaysLeft <= 14;

  const dirty = name !== group.name || description !== (group.description || "") || visibility !== initVis;

  const save = async () => {
    if (!name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    const { error } = await supabase.from("groups").update({
      name: name.trim(),
      description: description.trim() || null,
      is_public: visibility === "public",
      visibility,
    } as any).eq("id", group.id);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Atualizado"); onSaved(); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="font-display text-base font-bold text-foreground">Geral</h3>

      <GroupImageUpload
        groupId={group.id}
        currentUrl={group.image_url}
        onUploaded={async (url) => {
          await supabase.from("groups").update({ image_url: url }).eq("id", group.id);
          toast.success("Imagem atualizada");
          onSaved();
        }}
        onRemoved={async () => {
          await supabase.from("groups").update({ image_url: null }).eq("id", group.id);
          toast.success("Imagem removida");
          onSaved();
        }}
      />

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Nome do grupo *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Descrição</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3}
          className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Visibilidade</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: "public", icon: Globe, label: "Público" },
            { v: "private", icon: Lock, label: "Privado" },
            { v: "hidden", icon: EyeOff, label: "Oculto" },
          ].map(({ v, icon: Icon, label }) => (
            <button key={v} onClick={() => setVisibility(v)}
              className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-xs font-medium transition-colors ${
                visibility === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
              }`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {visibility === "public" && "Aparece em Explorar e qualquer um vê o conteúdo."}
          {visibility === "private" && "Aparece em Explorar mas só membros veem conteúdo."}
          {visibility === "hidden" && "Não aparece em Explorar — só por link de convite."}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <p><span className="text-foreground">Esporte:</span> <span className="capitalize">{group.sport}</span> · <span className="text-foreground">Máx jogadores:</span> {group.max_players} · <span className="text-foreground">Quadras:</span> {group.simultaneous_courts}</p>
      </div>

      <div className="rounded-2xl border border-border bg-background/40 p-3">
        <GroupCardPreview
          name={name}
          description={description}
          visibility={visibility}
          imageUrl={group.image_url}
          memberCount={group.member_count ?? 1}
          matchFormat={group.match_format}
          sport={group.sport}
          isPremium={isPremium}
        />
      </div>

      {dirty && (
        <button onClick={save} disabled={saving || !name.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      )}
    </div>
  );
}

/* =============== PRESENÇA =============== */
function PresenceSection({ group, onSaved }: { group: any; onSaved: () => void }) {
  const [mode, setMode] = useState(group.presence_open_mode || "1_day_before");
  const [time, setTime] = useState((group.presence_open_time || "10:00:00").slice(0, 5));
  const [saving, setSaving] = useState(false);

  const dirty = mode !== group.presence_open_mode || time !== (group.presence_open_time || "").slice(0, 5);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("groups").update({
      presence_open_mode: mode,
      presence_open_time: time + ":00",
    } as any).eq("id", group.id);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Regras salvas"); onSaved(); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-base font-bold text-foreground">Presença</h3>
        <p className="text-xs text-muted-foreground">Quando a lista de presença abre para os membros confirmarem.</p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Abertura da lista</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "always", label: "Sempre aberta" },
            { value: "same_day", label: "No mesmo dia" },
            { value: "1_day_before", label: "1 dia antes" },
            { value: "2_days_before", label: "2 dias antes" },
            { value: "random", label: "Aleatório" },
          ].map((o) => (
            <button key={o.value} onClick={() => setMode(o.value)}
              className={`rounded-2xl border p-2.5 text-xs font-medium transition-colors ${
                mode === o.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
              }`}>{o.label}</button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {mode === "always" && "Aberta assim que a rodada é criada."}
          {mode === "same_day" && "Abre no dia do jogo."}
          {mode === "1_day_before" && "Abre 1 dia antes."}
          {mode === "2_days_before" && "Abre 2 dias antes."}
          {mode === "random" && "Abre em horário aleatório entre 36h e 24h antes."}
        </p>
      </div>

      {mode !== "always" && mode !== "random" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Horário de abertura</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      )}

      {dirty && (
        <button onClick={save} disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </button>
      )}
    </div>
  );
}

/* =============== MEMBROS: solicitações + claims =============== */
function MembersSection({ group, onSaved }: { group: any; onSaved: () => void }) {
  const { user } = useAuth();
  const { pendingRequests, refresh } = useGroupDetail(group.id);

  const approve = async (req: any) => {
    if (!user) return;
    await approveJoinRequest(req.id, group.id, req.user_id, user.id);
    toast.success("Aprovado!"); refresh(); onSaved();
  };
  const reject = async (req: any) => {
    if (!user) return;
    await rejectJoinRequest(req.id, user.id);
    toast.success("Rejeitado"); refresh(); onSaved();
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display text-base font-bold text-foreground">Membros & vínculos</h3>
        <p className="text-xs text-muted-foreground">Solicitações de entrada e vínculos de jogadores placeholder.</p>
      </div>

      {pendingRequests.length > 0 && (
        <section>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-warning">
            Solicitações pendentes ({pendingRequests.length})
          </h4>
          <ul className="space-y-2">
            {pendingRequests.map((req: any) => (
              <li key={req.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                <p className="min-w-0 flex-1 truncate text-xs text-foreground">{req.message || "Sem mensagem"}</p>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => approve(req)} className="rounded-lg bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Aceitar</button>
                  <button onClick={() => reject(req)} className="rounded-lg bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">Recusar</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Vínculos de jogadores</h4>
        <PlayerClaimsManager groupId={group.id} onResolved={onSaved} />
      </section>
    </div>
  );
}

/* =============== CONVITES =============== */
function InvitesSection({ groupId, inviteOpen, setInviteOpen }: { groupId: string; inviteOpen: boolean; setInviteOpen: (o: boolean) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-base font-bold text-foreground">Convites</h3>
        <p className="text-xs text-muted-foreground">Gere e gerencie links para convidar novos membros.</p>
      </div>
      <button onClick={() => setInviteOpen(true)}
        className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
        <Link2 className="h-4 w-4" /> Gerenciar convites
      </button>
      <InviteLinkDialog open={inviteOpen} onOpenChange={setInviteOpen} groupId={groupId} isAdmin />
    </div>
  );
}

/* =============== AVANÇADO: status do grupo + delete =============== */
function AdvancedSection({ group, isCreator, onSaved }: { group: any; isCreator: boolean; onSaved: () => void }) {
  const navigate = useNavigate();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const setStatus = async (status: string, msg: string) => {
    await supabase.from("groups").update({ status }).eq("id", group.id);
    toast.success(msg); onSaved();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 font-display text-base font-bold text-destructive">
          <AlertTriangle className="h-4 w-4" /> Zona de perigo — Grupo
        </h3>
        <p className="text-xs text-muted-foreground">
          Ações que afetam o <strong className="text-foreground">grupo inteiro</strong> (não confundir com encerrar uma temporada — isso é feito em <strong className="text-foreground">Temporadas</strong>, expandindo a temporada desejada).
        </p>
      </div>

      {!isCreator ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/10 p-3 text-xs text-muted-foreground">
          Apenas o criador do grupo pode arquivar ou eliminar.
        </p>
      ) : (
        <div className="space-y-3">
          {group.status === "active" && (
            <>
              <div className="rounded-2xl border border-border bg-background/40 p-3">
                <div className="mb-2 flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Marcar grupo como concluído</p>
                    <p className="text-[11px] text-muted-foreground">
                      Use quando o grupo terminou suas atividades de vez. Continua visível em modo somente-leitura. Pode ser reativado depois.
                    </p>
                  </div>
                </div>
                <button onClick={() => setStatus("finished", "Grupo marcado como concluído")}
                  className="w-full rounded-xl border border-border py-2 text-xs font-bold hover:bg-accent/30">
                  Concluir grupo
                </button>
              </div>

              <div className="rounded-2xl border border-border bg-background/40 p-3">
                <div className="mb-2 flex items-start gap-2">
                  <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Desativar grupo</p>
                    <p className="text-[11px] text-muted-foreground">
                      Some das listas e ninguém entra mais. Os dados ficam preservados e você pode reativar quando quiser.
                    </p>
                  </div>
                </div>
                <button onClick={() => setStatus("inactive", "Grupo desativado")}
                  className="w-full rounded-xl border border-border py-2 text-xs font-bold text-muted-foreground hover:bg-accent/30">
                  Desativar grupo
                </button>
              </div>
            </>
          )}
          {(group.status === "inactive" || group.status === "finished") && (
            <button onClick={() => setStatus("active", "Grupo reativado")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 py-3 text-sm font-medium text-primary hover:bg-primary/10">
              <CheckCircle2 className="h-4 w-4" /> Reativar grupo
            </button>
          )}

          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
            <div className="mb-2 flex items-start gap-2">
              <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-destructive">Eliminar grupo permanentemente</p>
                <p className="text-[11px] text-muted-foreground">
                  Apaga o grupo, rodadas, partidas, rankings e histórico. <strong className="text-foreground">Não tem volta.</strong>
                </p>
              </div>
            </div>
            <button onClick={() => setShowDelete(true)}
              className="w-full rounded-xl border border-destructive/40 py-2 text-xs font-bold text-destructive hover:bg-destructive/10">
              Eliminar grupo
            </button>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDelete(false)} />
          <div className="relative w-[90%] max-w-sm rounded-3xl border border-border bg-card p-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <h3 className="font-display text-base font-bold text-foreground">Eliminar grupo?</h3>
              <p className="text-sm text-muted-foreground">
                Esta ação é <strong className="text-foreground">irreversível</strong>. Todos os dados serão perdidos.
              </p>
              <div className="flex w-full gap-3">
                <button onClick={() => setShowDelete(false)} className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold">Cancelar</button>
                <button onClick={async () => {
                  setDeleting(true);
                  try {
                    await supabase.from("groups").delete().eq("id", group.id);
                    toast.success("Grupo eliminado");
                    navigate({ to: "/groups" });
                  } catch { toast.error("Erro"); } finally { setDeleting(false); setShowDelete(false); }
                }} disabled={deleting}
                  className="flex-1 rounded-2xl bg-destructive py-3 text-sm font-bold text-destructive-foreground disabled:opacity-50">
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
