import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { GroupSettingsForm } from "@/components/GroupSettingsForm";
import { InviteLinkDialog } from "@/components/InviteLinkDialog";
import { PendingMatchCard } from "@/components/PendingMatchCard";
import { AddPlaceholderPlayerDialog } from "@/components/AddPlaceholderPlayerDialog";
import { ClaimPlayerDialog } from "@/components/ClaimPlayerDialog";
import { PlayerClaimsManager } from "@/components/PlayerClaimsManager";
import { SearchUserDialog } from "@/components/SearchUserDialog";
import { JoinGroupDialog } from "@/components/JoinGroupDialog";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { usePendingMatch } from "@/hooks/use-pending-matches";
import { useGroupSeasons, useSeasonRounds } from "@/hooks/use-seasons";
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
  KeyRound,
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
  Link2,
  Ghost,
  Search,
  Calendar,
  Clock,
  MapPin,
  UserCheck,
  Settings2,
  Pencil,
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
  const [tab, setTab] = useState<"members" | "resultados" | "temporadas" | "requests" | "settings">("members");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addPlaceholderOpen, setAddPlaceholderOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [searchUserOpen, setSearchUserOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [leavingLoading, setLeavingLoading] = useState(false);
  const [placeholderUserIds, setPlaceholderUserIds] = useState<Set<string>>(new Set());
  const [rankingData, setRankingData] = useState<Record<string, { rating: number; position: number | null; matches_played: number; matches_won: number }>>({});
  const [commentCount, setCommentCount] = useState(0);
  const [renamingUserId, setRenamingUserId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const { seasons, isLoading: seasonsLoading } = useGroupSeasons(groupId);

  const handleStartRename = (userId: string, currentName: string) => {
    setRenamingUserId(userId);
    setRenameValue(currentName);
  };

  const handleSaveRename = async () => {
    if (!renamingUserId) return;
    const newName = renameValue.trim();
    if (!newName) {
      toast.error("Nome não pode ficar vazio");
      return;
    }
    setRenameSaving(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ name: newName })
        .eq("user_id", renamingUserId);
      if (error) throw error;
      toast.success("Nome atualizado");
      setRenamingUserId(null);
      refresh();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar nome");
    } finally {
      setRenameSaving(false);
    }
  };

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

  // Detect which members are placeholders
  useEffect(() => {
    if (!members.length) return;
    const userIds = members.map((m) => m.user_id);
    supabase
      .from("user_profiles")
      .select("user_id")
      .in("user_id", userIds)
      .eq("is_placeholder", true)
      .then(({ data }) => {
        setPlaceholderUserIds(new Set((data || []).map((p) => p.user_id)));
      });
  }, [members]);

  // Load feed comment count
  useEffect(() => {
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .is("parent_id", null)
      .then(({ count }) => {
        setCommentCount(count ?? 0);
      });
  }, [groupId]);

  // Check if current user is already an ACTIVE member (to hide claim button)
  const isMemberAlready = members.some((m) => m.user_id === user?.id && (m as any).status === "active");
  const hasPlaceholders = placeholderUserIds.size > 0;
  const activeMembers = members.filter((m) => (m as any).status === "active");
  const formerMembers = members.filter((m) => (m as any).status !== "active");

  if (isLoading) {
    return <TrophyLoadingBar />;
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

  const handleJoin = () => {
    if (!user) return;
    setJoinDialogOpen(true);
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

  const handleRemove = async (memberId: string, memberName?: string) => {
    const ok = window.confirm(
      `Desvincular ${memberName || "este membro"} do grupo?\n\nO acesso ao grupo será revogado, mas o nome continuará aparecendo (esmaecido) em rankings, partidas e históricos.`,
    );
    if (!ok) return;
    try {
      await removeMember(memberId);
      toast.success("Membro desvinculado");
      refresh();
    } catch (e) {
      toast.error("Não foi possível desvincular o membro");
    }
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
  const rivalryPlayers = rivalry ? activeMembers.slice(0, 2) : [];
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
          <div className={`grid gap-3 ${hasPlaceholders ? "grid-cols-2" : "grid-cols-1"}`}>
            <button
              onClick={handleJoin}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-primary p-4 text-primary-foreground transition-transform active:scale-95"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-foreground/15">
                <UserPlus className="h-6 w-6" />
              </div>
              <span className="text-sm font-bold leading-tight text-center">
                {group.is_public ? "Entrar no grupo" : "Solicitar entrada"}
              </span>
              <span className="text-[10px] font-medium opacity-80 text-center leading-tight">
                Como novo jogador
              </span>
            </button>
            {hasPlaceholders && (
              <button
                onClick={() => setClaimOpen(true)}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-primary transition-transform active:scale-95"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Link2 className="h-6 w-6" />
                </div>
                <span className="text-sm font-bold leading-tight text-center text-foreground">
                  Entrar e vincular
                </span>
                <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight">
                  A um jogador existente
                </span>
              </button>
            )}
          </div>
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
            {rivalry ? "Duelo" : "Membros"}
          </button>
          <button
            onClick={() => setTab("resultados")}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
              tab === "resultados" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Resultados
          </button>
          <button
            onClick={() => setTab("temporadas")}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
              tab === "temporadas" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Temporadas
          </button>
          {isAdmin && (
            <button
              onClick={() => setTab("requests")}
              className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                tab === "requests" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
              title="Solicitações"
            >
              <UserCheck className="h-4 w-4" />
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
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                tab === "settings" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
              title="Configurações"
            >
              <Settings2 className="h-4 w-4" />
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
                {[
                  ...[...activeMembers].sort((a, b) => {
                    const ra = rankingData[a.user_id]?.rating || 0;
                    const rb = rankingData[b.user_id]?.rating || 0;
                    return rb - ra;
                  }),
                  ...formerMembers,
                ].map((m) => {
                  const rank = rankingData[m.user_id];
                  const isFormer = (m as any).status !== "active";
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center justify-between px-3 py-2.5 ${isFormer ? "bg-muted/10" : ""}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {!isFormer && rank?.position ? (
                          <span className="w-5 text-center text-xs font-bold text-muted-foreground">
                            {rank.position}
                          </span>
                        ) : (
                          <span className="w-5 text-center text-[10px] text-muted-foreground/40">—</span>
                        )}
                        <PlayerAvatar
                          avatarUrl={isFormer ? null : m.profile?.avatar_url}
                          name={isFormer ? "?" : (m.profile?.name || "?")}
                          size="lg"
                          className="border border-border"
                          dimmed={isFormer}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {isFormer && isAdmin && renamingUserId === m.user_id ? (
                              <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveRename();
                                  if (e.key === "Escape") setRenamingUserId(null);
                                }}
                                autoFocus
                                disabled={renameSaving}
                                className="flex-1 min-w-0 rounded-lg border border-primary/40 bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            ) : (
                              <span className={`text-sm font-medium truncate ${isFormer ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                {m.profile?.nickname || m.profile?.name || "Jogador"}
                              </span>
                            )}
                            {!isFormer && m.role === "creator" && <Crown className="h-3 w-3 text-rank-gold flex-shrink-0" />}
                            {!isFormer && m.role === "admin" && <Shield className="h-3 w-3 text-info flex-shrink-0" />}
                            {!isFormer && placeholderUserIds.has(m.user_id) && (
                              <span className="flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground flex-shrink-0">
                                <Ghost className="h-2.5 w-2.5" />
                                Sem conta
                              </span>
                            )}
                            {isFormer && renamingUserId !== m.user_id && (
                              <span className="flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground flex-shrink-0">
                                <UserMinus className="h-2.5 w-2.5" />
                                Ex-membro
                              </span>
                            )}
                          </div>
                          {rank && renamingUserId !== m.user_id ? (
                            <p className={`text-[10px] ${isFormer ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                              {Math.round(rank.rating)} Elo · {rank.matches_won}V {rank.matches_played - rank.matches_won}D
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!isFormer && rank && (
                          <span className="text-xs font-bold text-primary">{Math.round(rank.rating)}</span>
                        )}
                        {isFormer && isAdmin && (
                          renamingUserId === m.user_id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={handleSaveRename}
                                disabled={renameSaving}
                                className="rounded-lg bg-success/10 p-1.5 text-success disabled:opacity-50"
                                title="Salvar"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => setRenamingUserId(null)}
                                disabled={renameSaving}
                                className="rounded-lg bg-muted p-1.5 text-muted-foreground disabled:opacity-50"
                                title="Cancelar"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleStartRename(m.user_id, m.profile?.name || "")}
                              className="rounded-lg bg-muted p-1.5 text-muted-foreground hover:text-foreground"
                              title="Renomear ex-membro"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )
                        )}
                        {!isFormer && isAdmin && m.user_id !== user?.id && m.role !== "creator" && (
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
                              onClick={() => handleRemove(m.id, m.profile?.name)}
                              className="rounded-lg bg-destructive/10 p-1.5 text-destructive"
                              title="Desvincular do grupo"
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

            {/* Admin: Claims pendentes */}
            {isAdmin && (
              <PlayerClaimsManager groupId={groupId} onResolved={refresh} />
            )}

            {/* Feed do grupo - abaixo da tabela */}
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
                <div className="flex items-center gap-2">
                  {commentCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">
                      {commentCount}
                    </span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </Link>
            )}


            {/* Admin: Adicionar jogador sem conta */}
            {isAdmin && (
              <div className="rounded-2xl border border-border bg-card/50 overflow-hidden divide-y divide-border">
                <button
                  onClick={() => setSearchUserOpen(true)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-accent/30"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                    <Search className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Buscar jogador</p>
                    <p className="text-[10px] text-muted-foreground">Adicionar usuário já cadastrado</p>
                  </div>
                </button>
                <button
                  onClick={() => setAddPlaceholderOpen(true)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-accent/30"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                    <Ghost className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Adicionar sem conta</p>
                    <p className="text-[10px] text-muted-foreground">Somente com nome, vincula depois</p>
                  </div>
                </button>
                <button
                  onClick={handleShareInvite}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-accent/30"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                    <Share2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Convidar por link</p>
                    <p className="text-[10px] text-muted-foreground">Enviar link de convite</p>
                  </div>
                </button>
              </div>
            )}

            {/* User: Vincular conta — only show inline here for active members (non-members see square card at top) */}
            {isAuthenticated && isMemberAlready && hasPlaceholders && (
              <button
                onClick={() => setClaimOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm font-medium text-primary transition-colors active:bg-primary/10"
              >
                <Link2 className="h-4 w-4" />
                Vincular minha conta a um jogador
              </button>
            )}

            {/* Convidar jogadores */}
            {isMember && !isAdmin && !rivalry && (
              <button
                onClick={handleShareInvite}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/50 p-3 text-sm font-medium text-foreground transition-colors active:bg-accent/30"
              >
                <Share2 className="h-4 w-4 text-primary" />
                Convidar jogadores
              </button>
            )}

            {isMember && !isCreator && (
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

        {/* Resultados tab — rodadas da temporada ativa */}
        {tab === "resultados" && (
          <ActiveSeasonRounds
            groupId={groupId}
            seasons={seasons}
            seasonsLoading={seasonsLoading}
            isAdmin={isAdmin}
          />
        )}

        {/* Temporadas tab */}
        {tab === "temporadas" && (
          <>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-foreground">Temporadas</h2>
              {isAdmin && (
                <Link
                  to="/groups/$groupId/seasons"
                  params={{ groupId }}
                  className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Gerenciar
                </Link>
              )}
            </div>
            {seasonsLoading ? (
              <TrophyLoadingBar fullScreen={false} compact />
            ) : seasons.filter((s) => s.status !== "hidden").length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Trophy className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="font-display text-base font-bold text-foreground">Nenhuma temporada</h3>
                  <p className="text-sm text-muted-foreground">
                    {isAdmin
                      ? "Crie a primeira temporada para começar o ranking."
                      : "O admin do grupo ainda não criou temporadas."}
                  </p>
                  {isAdmin && (
                    <Link
                      to="/groups/$groupId/seasons"
                      params={{ groupId }}
                      className="mt-2 flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                    >
                      Criar temporada
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              seasons.filter((s) => s.status !== "hidden").map((s) => (
                <Link
                  key={s.id}
                  to="/groups/$groupId/seasons/$seasonId"
                  params={{ groupId, seasonId: s.id }}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card/50 p-4 transition-colors active:bg-accent/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Trophy className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-foreground">{s.name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.status === "active" ? "bg-success" : "bg-muted-foreground"}`} />
                        <span className="capitalize">{s.status === "active" ? "Ativa" : s.status === "finished" ? "Encerrada" : s.status}</span>
                        {s.total_rounds && <span>• {s.total_rounds} rodadas</span>}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))
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
            visibility={(group as any).visibility}
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

      {/* Dialogs */}
      {isAdmin && user && (
        <AddPlaceholderPlayerDialog
          open={addPlaceholderOpen}
          onOpenChange={setAddPlaceholderOpen}
          groupId={groupId}
          adminUserId={user.id}
          onAdded={refresh}
        />
      )}

      {isAuthenticated && user && (
        <ClaimPlayerDialog
          open={claimOpen}
          onOpenChange={setClaimOpen}
          groupId={groupId}
          claimerUserId={user.id}
          onClaimed={refresh}
        />
      )}

      {isAdmin && (
        <SearchUserDialog
          open={searchUserOpen}
          onOpenChange={setSearchUserOpen}
          groupId={groupId}
          existingMemberIds={members.map((m) => m.user_id)}
          onAdded={refresh}
        />
      )}

      {isAuthenticated && user && !isMember && (
        <JoinGroupDialog
          open={joinDialogOpen}
          onOpenChange={setJoinDialogOpen}
          groupId={groupId}
          isPublicGroup={group.is_public}
          userId={user.id}
          onJoined={refresh}
        />
      )}
    </div>
  );
}

function ActiveSeasonRounds({
  groupId,
  seasons,
  seasonsLoading,
  isAdmin,
}: {
  groupId: string;
  seasons: { id: string; status: string; name: string }[];
  seasonsLoading: boolean;
  isAdmin: boolean;
}) {
  const activeSeason = seasons.find((s) => s.status === "active") || null;
  const { rounds, isLoading } = useSeasonRounds(activeSeason?.id || "");

  if (seasonsLoading) {
    return <TrophyLoadingBar fullScreen={false} compact />;
  }

  if (!activeSeason) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Trophy className="h-7 w-7 text-primary" />
          </div>
          <h3 className="font-display text-base font-bold text-foreground">Sem temporada ativa</h3>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Crie ou ative uma temporada para ver as rodadas aqui."
              : "Aguarde o admin iniciar uma temporada para ver as rodadas."}
          </p>
          {isAdmin && (
            <Link
              to="/groups/$groupId/seasons"
              params={{ groupId }}
              className="mt-2 flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Gerenciar temporadas
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <TrophyLoadingBar fullScreen={false} compact />;
  }

  const today = new Date().toISOString().split("T")[0];
  const formatDate = (d: string | null) => {
    if (!d) return "Sem data";
    return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  };
  const getSmartStatus = (r: typeof rounds[0]) => {
    if (r.status !== "scheduled") return r.status;
    if (r.scheduled_date && r.scheduled_date <= today) return "pending_result";
    return "scheduled";
  };
  const statusLabel = (s: string) =>
    s === "scheduled" ? "Agendada"
    : s === "pending_result" ? "Lançar resultado"
    : s === "in_progress" ? "Em jogo"
    : s === "completed" ? "Encerrada"
    : s === "cancelled" ? "Cancelada"
    : s;
  const statusClass = (s: string) =>
    s === "scheduled" ? "bg-info/10 text-info"
    : s === "pending_result" ? "bg-warning/10 text-warning"
    : s === "in_progress" ? "bg-warning/10 text-warning"
    : s === "completed" ? "bg-success/10 text-success"
    : s === "cancelled" ? "bg-destructive/10 text-destructive"
    : "bg-muted text-muted-foreground";

  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate">{activeSeason.name}</h2>
          <p className="text-[10px] text-muted-foreground">Temporada ativa · {rounds.length} rodada{rounds.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          to="/groups/$groupId/seasons/$seasonId"
          params={{ groupId, seasonId: activeSeason.id }}
          className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground"
        >
          Ver temporada
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {rounds.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground/40" />
            <h3 className="font-display text-base font-bold text-foreground">Nenhuma rodada</h3>
            <p className="text-sm text-muted-foreground">
              As rodadas aparecerão aqui assim que forem criadas.
            </p>
          </div>
        </div>
      ) : (
        rounds.map((r) => (
          <div key={r.id} className={`rounded-2xl border border-border bg-card/50 ${r.status === "cancelled" ? "opacity-50" : ""}`}>
            {r.status !== "cancelled" ? (
              <Link
                to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                params={{ groupId, seasonId: activeSeason.id, roundId: r.id }}
                className="flex items-center justify-between p-4 active:bg-accent/30"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
                    <span className="font-display text-sm font-bold text-primary">
                      R{r.round_number || "?"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-foreground">Rodada {r.round_number}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(r.scheduled_date)}</span>
                      {r.scheduled_time && (
                        <>
                          <Clock className="h-3 w-3" />
                          <span>{r.scheduled_time?.slice(0, 5)}</span>
                        </>
                      )}
                    </div>
                    {r.location && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{r.location}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusClass(getSmartStatus(r))}`}>
                    {statusLabel(getSmartStatus(r))}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ) : (
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <span className="font-display text-sm font-bold text-muted-foreground">
                      R{r.round_number || "?"}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-muted-foreground line-through">
                      Rodada {r.round_number}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(r.scheduled_date)}</span>
                    </div>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusClass(r.status)}`}>
                  {statusLabel(r.status)}
                </span>
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
