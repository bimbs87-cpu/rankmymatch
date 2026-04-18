import { useState } from "react";
import { Settings2, Bell, Users, Link2, AlertTriangle } from "lucide-react";
import { GroupSettingsForm } from "@/components/GroupSettingsForm";
import { InviteLinkDialog } from "@/components/InviteLinkDialog";
import { PlayerClaimsManager } from "@/components/PlayerClaimsManager";

type Section = "general" | "presence" | "members" | "invites" | "advanced";

interface Props {
  group: any;
  isCreator: boolean;
  onSaved: () => void;
  onShareInvite: () => void;
  pendingRequestsCount: number;
}

const SECTIONS: { id: Section; label: string; icon: typeof Settings2; description: string }[] = [
  { id: "general", label: "Geral", icon: Settings2, description: "Nome, descrição, imagem e visibilidade" },
  { id: "presence", label: "Presença", icon: Bell, description: "Regras de abertura de listas" },
  { id: "members", label: "Membros", icon: Users, description: "Solicitações pendentes e claims" },
  { id: "invites", label: "Convites", icon: Link2, description: "Links de convite ativos" },
  { id: "advanced", label: "Avançado", icon: AlertTriangle, description: "Zona perigosa" },
];

export function AdminPanel({ group, isCreator, onSaved, onShareInvite, pendingRequestsCount }: Props) {
  const [section, setSection] = useState<Section>("general");
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Administração</h2>
        <p className="text-xs text-muted-foreground">Configurações e gestão do grupo</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Sub-nav */}
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
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{s.label}</span>
                    {badge > 0 && (
                      <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                        {badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content */}
        <div className="rounded-2xl border border-border bg-card p-5">
          {section === "general" && (
            <GroupSettingsForm
              groupId={group.id}
              name={group.name}
              description={group.description}
              isPublic={group.is_public}
              visibility={group.visibility}
              maxPlayers={group.max_players}
              sport={group.sport}
              simultaneousCourts={group.simultaneous_courts}
              imageUrl={group.image_url}
              groupStatus={group.status}
              isCreator={isCreator}
              presenceOpenMode={group.presence_open_mode}
              presenceOpenTime={group.presence_open_time}
              onSaved={onSaved}
            />
          )}

          {section === "presence" && (
            <div className="space-y-3">
              <h3 className="font-display text-base font-bold text-foreground">Regras de presença</h3>
              <p className="text-sm text-muted-foreground">
                Configure quando a lista de presença abre para os membros confirmarem.
              </p>
              <p className="rounded-xl border border-dashed border-border bg-muted/10 p-4 text-xs text-muted-foreground">
                As regras de presença são editadas na aba <strong className="text-foreground">Geral</strong> no momento.
                Em breve teremos uma seção dedicada com mais opções.
              </p>
            </div>
          )}

          {section === "members" && (
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-base font-bold text-foreground">Solicitações & vínculos</h3>
                <p className="text-xs text-muted-foreground">
                  Aprove pedidos de entrada e vínculos de jogadores.
                </p>
              </div>
              <PlayerClaimsManager groupId={group.id} onResolved={onSaved} />
            </div>
          )}

          {section === "invites" && (
            <div className="space-y-3">
              <h3 className="font-display text-base font-bold text-foreground">Links de convite</h3>
              <p className="text-sm text-muted-foreground">
                Gere e gerencie links para convidar novos membros.
              </p>
              <button
                onClick={() => setInviteOpen(true)}
                className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                <Link2 className="h-4 w-4" />
                Gerenciar convites
              </button>
              <InviteLinkDialog
                open={inviteOpen}
                onOpenChange={setInviteOpen}
                groupId={group.id}
                isAdmin={true}
              />
            </div>
          )}

          {section === "advanced" && (
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 font-display text-base font-bold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Zona perigosa
              </h3>
              <p className="text-sm text-muted-foreground">
                Ações destrutivas estão disponíveis na aba <strong className="text-foreground">Geral</strong>{" "}
                (arquivar/excluir grupo). Apenas o criador pode executá-las.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
