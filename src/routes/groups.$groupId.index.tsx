import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { GroupSettingsForm } from "@/components/GroupSettingsForm";
import { InviteLinkDialog } from "@/components/InviteLinkDialog";
import { PendingMatchCard } from "@/components/PendingMatchCard";
import { useAuth } from "@/hooks/use-auth";
import { usePendingMatch } from "@/hooks/use-pending-matches";
import { supabase } from "@/integrations/supabase/client";
import { isRivalryGroup } from "@/lib/rivalry";
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
  LogOut,
  AlertTriangle,
  Swords,
  TrendingUp,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/groups/$groupId/")({
  component: GroupDetailPage,
});

function GroupDetailPage() {
  const { groupId } = Route.useParams();
  const { user, isAuthenticated } = useAuth();
  const { group, memberCount, members, myRole, isAdmin, isCreator, pendingRequests, isLoading, refresh } =
    useGroupDetail(groupId);
  const { pendingMatch, refresh: refreshPending } = usePendingMatch(groupId);
  const navigate = useNavigate();
  const [tab, setTab] = useState<"members" | "requests" | "settings">("members");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [leavingLoading, setLeavingLoading] = useState(false);
  const [rankingData, setRankingData] = useState<Record<string, { rating: number; position: number | null; matches_played: number; matches_won: number }>>({});

  const rivalry = isRivalryGroup(group, memberCount);

  useEffect(() => {
    const loadRanking = async () => {
      const { data: season } = await supabase
        .from("seasons")
        .select("id")
        .eq("group_id", groupId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (season) {
        const { data: snaps } = await supabase
          .from("ranking_snapshots")
          .select("user_id, rating, position, matches_played, matches_won")
          .eq("season_id", season.id);
        const map: Record<string, any> = {};
        (snaps || []).forEach((s) => { map[s.user_id] = s; });
        setRankingData(map);
      }
    };
    loadRanking();
  }, [groupId]);

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

  const handleLeaveClick = async () => {
    if (!user) return;
    const results = await checkUserHasResults(groupId, user.id);
    setHasResults(results);
    setLeaveDialogOpen(true);
  };

  const handleLeaveConfirm = async () => {
    if (!user) return;
    const myMembership = members.find((m) => m.user_id === user.id);
    if (!myMembership) return;
    setLeavingLoading(true);
    try {
      await leaveGroup(myMembership.id);
      toast.success("Você saiu do grupo");
      navigate({ to: "/groups" });
    } catch (e: any) {
      toast.error("Erro ao sair do grupo");
    } finally {
      setLeavingLoading(false);
      setLeaveDialogOpen(false);
    }
  };

  // Rivalry duel data
  const rivalryPlayers = rivalry ? members.slice(0, 2) : [];
  const playerA = rivalryPlayers[0];
  const playerB = rivalryPlayers[1];
  const rankA = playerA ? rankingData[playerA.user_id] : null;
  const rankB = playerB ? rankingData[playerB.user_id] : null;

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
              {rivalry && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  Rivalidade
                </span>
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

      <InviteLinkDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        groupId={groupId}
        isAdmin={isAdmin}
      />

      {/* Leave Group Dialog */}
      {leaveDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setLeaveDialogOpen(false)} />
          <div className="relative w-[90%] max-w-sm rounded-3xl border border-border bg-card p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <h3 className="font-display text-base font-bold text-foreground">Sair do grupo?</h3>
              {hasResults ? (
                <p className="text-sm text-muted-foreground">
                  Seus jogos cadastrados continuarão no ranking como <strong className="text-foreground">anônimo</strong>. 
                  Você <strong className="text-foreground">não poderá voltar</strong> a este grupo, 
                  a não ser que receba um convite direto do admin.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Tem certeza que deseja sair deste grupo?
                </p>
              )}
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setLeaveDialogOpen(false)}
                  className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-foreground"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleLeaveConfirm}
                  disabled={leavingLoading}
                  className="flex-1 rounded-2xl bg-destructive py-3 text-sm font-bold text-destructive-foreground disabled:opacity-50"
                >
                  {leavingLoading ? "Saindo..." : "Sair"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Próximo confronto pendente */}
      {isMember && pendingMatch && (
        <div className="mx-5 mb-4">
          <PendingMatchCard
            match={pendingMatch}
            onScoreSaved={() => { refreshPending(); refresh(); }}
            showGroupName={false}
            isAdmin={isAdmin}
          />
        </div>
      )}

      {/* Tabs */}
      {isMember && (
        <div className="mx-5 mb-4 flex gap-1 rounded-full border border-border bg-card p-1">
          <button
            onClick={() => setTab("members")}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
              tab === "members" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {rivalry ? "Duelo" : "Ranking"}
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
          <>
            {/* Rivalry Duel Card */}
            {rivalry && playerA && playerB ? (
              <div className="rounded-3xl border border-border bg-card/50 p-5">
                <div className="flex items-center justify-center gap-1.5 mb-4">
                  <Swords className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">Rivalidade</span>
                </div>

                {/* Players face-off */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col items-center gap-2 flex-1">
                    <PlayerAvatar
                      avatarUrl={playerA.profile?.avatar_url}
                      name={playerA.profile?.name || "?"}
                      size="xl"
                      className="ring-2 ring-primary/30"
                    />
                    <div className="text-center">
                      <p className="text-sm font-bold text-foreground truncate max-w-[100px]">
                        {playerA.profile?.nickname || playerA.profile?.name || "Jogador 1"}
                      </p>
                      {playerA.role === "creator" && <Crown className="mx-auto h-3 w-3 text-rank-gold" />}
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1 px-3">
                    <span className="text-2xl font-display font-black text-muted-foreground">VS</span>
                  </div>

                  <div className="flex flex-col items-center gap-2 flex-1">
                    <PlayerAvatar
                      avatarUrl={playerB.profile?.avatar_url}
                      name={playerB.profile?.name || "?"}
                      size="xl"
                      className="ring-2 ring-info/30"
                    />
                    <div className="text-center">
                      <p className="text-sm font-bold text-foreground truncate max-w-[100px]">
                        {playerB.profile?.nickname || playerB.profile?.name || "Jogador 2"}
                      </p>
                      {playerB.role === "creator" && <Crown className="mx-auto h-3 w-3 text-rank-gold" />}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between rounded-2xl bg-muted/30 px-4 py-3">
                  <div className="text-center flex-1">
                    <p className="font-display text-xl font-black text-primary">
                      {rankA?.matches_won ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">vitórias</p>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div className="text-center flex-1">
                    <p className="font-display text-sm font-bold text-muted-foreground">
                      {(rankA?.matches_played ?? 0)} jogos
                    </p>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div className="text-center flex-1">
                    <p className="font-display text-xl font-black text-info">
                      {rankB?.matches_won ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">vitórias</p>
                  </div>
                </div>

                {/* Elo */}
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    <span>{Math.round(rankA?.rating ?? 1000)} Elo</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    <span>{Math.round(rankB?.rating ?? 1000)} Elo</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Standard ranking list */
              <div className="rounded-2xl border border-border bg-card/50 divide-y divide-border overflow-hidden">
                {[...members].sort((a, b) => {
                  const ra = rankingData[a.user_id]?.rating || 0;
                  const rb = rankingData[b.user_id]?.rating || 0;
                  return rb - ra;
                }).map((m) => {
                  const rank = rankingData[m.user_id];
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {rank?.position ? (
                          <span className="w-5 text-center text-xs font-bold text-muted-foreground">
                            {rank.position}
                          </span>
                        ) : (
                          <span className="w-5 text-center text-[10px] text-muted-foreground/40">—</span>
                        )}
                        <PlayerAvatar
                          avatarUrl={m.profile?.avatar_url}
                          name={m.profile?.name || "?"}
                          size="lg"
                          className="border border-border"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-foreground truncate">
                              {m.profile?.nickname || m.profile?.name || "Jogador"}
                            </span>
                            {m.role === "creator" && <Crown className="h-3 w-3 text-rank-gold flex-shrink-0" />}
                            {m.role === "admin" && <Shield className="h-3 w-3 text-info flex-shrink-0" />}
                          </div>
                          {rank ? (
                            <p className="text-[10px] text-muted-foreground">
                              {Math.round(rank.rating)} Elo · {rank.matches_won}V {rank.matches_played - rank.matches_won}D
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {rank && (
                          <span className="text-xs font-bold text-primary">{Math.round(rank.rating)}</span>
                        )}
                        {isAdmin && m.user_id !== user?.id && m.role !== "creator" && (
                          <div className="flex gap-1">
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
                    </div>
                  );
                })}
              </div>
            )}

            {/* Convidar jogadores */}
            {isMember && !rivalry && (
              <button
                onClick={handleShareInvite}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/50 p-3 text-sm font-medium text-foreground transition-colors active:bg-accent/30"
              >
                <Share2 className="h-4 w-4 text-primary" />
                Convidar jogadores
              </button>
            )}

            {/* Feed */}
            {isMember && (
              <Link
                to="/groups/$groupId/feed"
                params={{ groupId }}
                className="flex items-center justify-between rounded-2xl border border-border bg-card/50 px-4 py-3 transition-colors active:bg-accent/30"
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Feed do grupo</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            )}

            {/* Temporadas */}
            {isMember && (
              <Link
                to="/groups/$groupId/seasons"
                params={{ groupId }}
                className="flex items-center justify-between rounded-2xl border border-border bg-card/50 px-4 py-3 transition-colors active:bg-accent/30"
              >
                <div className="flex items-center gap-2.5">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Temporadas</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            )}

            {!isCreator && (
              <button
                onClick={handleLeaveClick}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 py-3 text-sm font-medium text-destructive transition-colors active:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                Sair do grupo
              </button>
            )}
          </>
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
            groupStatus={(group as any).status || "active"}
            isCreator={isCreator}
            presenceOpenMode={(group as any).presence_open_mode || "1_day_before"}
            presenceOpenTime={(group as any).presence_open_time || "10:00:00"}
            onSaved={refresh}
          />
        )}
      </div>

    </div>
  );
}
