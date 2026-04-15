import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { GroupSettingsForm } from "@/components/GroupSettingsForm";
import { InviteLinkDialog } from "@/components/InviteLinkDialog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  useGroupDetail,
  joinGroup,
  approveJoinRequest,
  rejectJoinRequest,
  removeMember,
  updateMemberRole,
  leaveGroup,
  checkUserHasResults,
} from "@/hooks/use-groups";
import {
  ArrowLeft,
  Users,
  Globe,
  Lock,
  Crown,
  Shield,
  Copy,
  UserPlus,
  UserMinus,
  Check,
  X,
  Settings,
  Share2,
  Trophy,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/groups/$groupId/")({
  component: GroupDetailPage,
});

function GroupDetailPage() {
  const { groupId } = Route.useParams();
  const { user, isAuthenticated } = useAuth();
  const { group, memberCount, members, myRole, isAdmin, isCreator, pendingRequests, isLoading, refresh } =
    useGroupDetail(groupId);
  const navigate = useNavigate();
  const [tab, setTab] = useState<"members" | "requests" | "settings">("members");
  const [inviteOpen, setInviteOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <h2 className="font-display text-lg font-bold text-foreground">Grupo não encontrado</h2>
        <Link to="/groups" className="mt-4 text-sm text-primary">
          Voltar
        </Link>
      </div>
    );
  }

  const isMember = !!myRole;

  const handleJoin = async () => {
    if (!user) return;
    try {
      await joinGroup(groupId, user.id, group.is_public);
      toast.success(group.is_public ? "Você entrou no grupo!" : "Solicitação enviada!");
      refresh();
    } catch (e: any) {
      toast.error(e.message?.includes("duplicate") ? "Você já é membro ou já solicitou." : "Erro ao entrar");
    }
  };

  const handleShareInvite = () => {
    setInviteOpen(true);
  };

  const handleApprove = async (req: any) => {
    if (!user) return;
    await approveJoinRequest(req.id, groupId, req.user_id, user.id);
    toast.success("Membro aprovado!");
    refresh();
  };

  const handleReject = async (req: any) => {
    if (!user) return;
    await rejectJoinRequest(req.id, user.id);
    toast.success("Solicitação rejeitada");
    refresh();
  };

  const handleRemove = async (memberId: string) => {
    await removeMember(memberId);
    toast.success("Membro removido");
    refresh();
  };

  const handlePromote = async (memberId: string) => {
    await updateMemberRole(memberId, "admin");
    toast.success("Promovido a admin");
    refresh();
  };

  const handleDemote = async (memberId: string) => {
    await updateMemberRole(memberId, "member");
    toast.success("Rebaixado a membro");
    refresh();
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      {group.image_url && (
        <div className="relative h-36 w-full">
          <img src={group.image_url} alt={group.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
      )}
      <header className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <Link
            to="/groups"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-lg font-bold text-foreground">{group.name}</h1>
              {group.is_public ? (
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">{memberCount} membros ativos</p>
          </div>
          {isMember && (
            <button
              onClick={handleShareInvite}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
            >
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </header>

      {isMember && (
        <div className="mx-5 mb-4 space-y-2">
          <Link
            to="/groups/$groupId/seasons"
            params={{ groupId }}
            className="flex items-center justify-between rounded-2xl border border-border bg-card/50 p-4 transition-colors active:bg-accent/30"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Trophy className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground">Temporadas</span>
                <p className="text-xs text-muted-foreground">Rankings, rodadas e partidas</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link
            to="/groups/$groupId/feed"
            params={{ groupId }}
            className="flex items-center justify-between rounded-2xl border border-border bg-card/50 p-4 transition-colors active:bg-accent/30"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info/10">
                <MessageSquare className="h-5 w-5 text-info" />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground">Feed</span>
                <p className="text-xs text-muted-foreground">Comentários e reações do grupo</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      )}

      {group.description && (
        <div className="px-5 pb-4">
          <p className="text-sm text-muted-foreground">{group.description}</p>
        </div>
      )}

      {isAuthenticated && !isMember && (
        <div className="px-5 pb-4">
          <button
            onClick={handleJoin}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground"
          >
            <UserPlus className="h-4 w-4" />
            {group.is_public ? "Entrar no grupo" : "Solicitar entrada"}
          </button>
        </div>
      )}

      {isMember && (
        <div className="mx-5 mb-4">
          <button
            onClick={handleShareInvite}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/50 p-4 text-sm font-medium text-foreground transition-colors active:bg-accent/30"
          >
            <Share2 className="h-4 w-4 text-primary" />
            Convidar jogadores
          </button>
        </div>
      )}

      <InviteLinkDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        groupId={groupId}
        isAdmin={isAdmin}
      />

      {isMember && (
        <div className="mx-5 mb-4 flex gap-1 rounded-full border border-border bg-card p-1">
          <button
            onClick={() => setTab("members")}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
              tab === "members" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Membros
          </button>
          {isAdmin && (
            <button
              onClick={() => setTab("requests")}
              className={`relative flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
                tab === "requests" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Solicitações
              {pendingRequests.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setTab("settings")}
              className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
                tab === "settings" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Config
            </button>
          )}
        </div>
      )}

      <div className="space-y-3 px-5">
        {tab === "members" && (
          <div className="rounded-2xl border border-border bg-card/50 divide-y divide-border overflow-hidden">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {m.profile?.avatar_url ? (
                    <img
                      src={m.profile.avatar_url}
                      alt=""
                      className="h-8 w-8 rounded-full border border-border object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground flex-shrink-0">
                      {(m.profile?.name || "?").charAt(0)}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">
                      {m.profile?.nickname || m.profile?.name || "Jogador"}
                    </span>
                    {m.role === "creator" && <Crown className="h-3 w-3 text-rank-gold flex-shrink-0" />}
                    {m.role === "admin" && <Shield className="h-3 w-3 text-info flex-shrink-0" />}
                  </div>
                </div>

                {isAdmin && m.user_id !== user?.id && m.role !== "creator" && (
                  <div className="flex gap-1 flex-shrink-0">
                    {m.role === "member" ? (
                      <button
                        onClick={() => handlePromote(m.id)}
                        className="rounded-lg bg-info/10 p-1.5 text-info"
                        title="Promover"
                      >
                        <Shield className="h-3 w-3" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDemote(m.id)}
                        className="rounded-lg bg-warning/10 p-1.5 text-warning"
                        title="Rebaixar"
                      >
                        <Shield className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(m.id)}
                      className="rounded-lg bg-destructive/10 p-1.5 text-destructive"
                      title="Remover"
                    >
                      <UserMinus className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "requests" && isAdmin && (
          <>
            {pendingRequests.length === 0 && (
              <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente</p>
              </div>
            )}
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-card/50 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">Solicitação</p>
                  <p className="text-xs text-muted-foreground">{req.message || "Sem mensagem"}</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleApprove(req)}
                    className="rounded-lg bg-success/10 p-2 text-success"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleReject(req)}
                    className="rounded-lg bg-destructive/10 p-2 text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "settings" && isAdmin && (
          <GroupSettingsForm
            groupId={groupId}
            name={group.name}
            description={group.description}
            isPublic={group.is_public}
            maxPlayers={group.max_players}
            sport={group.sport}
            simultaneousCourts={group.simultaneous_courts}
            imageUrl={group.image_url}
            onSaved={refresh}
          />
        )}
      </div>

      <BottomNav />
    </div>
  );
}