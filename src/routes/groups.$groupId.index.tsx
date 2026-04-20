import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Globe,
  Lock,
  Share2,
  UserPlus,
  Link2,
  Swords,
  ChevronRight,
  AlertTriangle,
  LogOut,
  Menu,
  Crown,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import {
  useGroupDetail,
  approveJoinRequest,
  rejectJoinRequest,
  removeMember,
  updateMemberRole,
  leaveGroup,
  checkUserHasResults,
} from "@/hooks/use-groups";
import { usePendingMatch } from "@/hooks/use-pending-matches";
import { supabase } from "@/integrations/supabase/client";
import { isRivalryGroup } from "@/lib/rivalry";

import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { PendingMatchCard } from "@/components/PendingMatchCard";
import { InviteLinkDialog } from "@/components/InviteLinkDialog";
import { AddPlaceholderPlayerDialog } from "@/components/AddPlaceholderPlayerDialog";
import { ClaimPlayerDialog } from "@/components/ClaimPlayerDialog";
import { MergeMembersDialog } from "@/components/MergeMembersDialog";
import { SearchUserDialog } from "@/components/SearchUserDialog";
import { JoinGroupDialog } from "@/components/JoinGroupDialog";
import { ShareGroupDialog } from "@/components/ShareGroupDialog";

import {
  GroupInternalSidebar,
  GroupInternalSidebarDrawer,
  type GroupView,
  type SidebarBadges,
} from "@/components/groups/internal/GroupInternalSidebar";
import { GroupOverviewPanel } from "@/components/groups/internal/GroupOverviewPanel";
import { MembersPanel } from "@/components/groups/internal/MembersPanel";

import { SeasonsPanel } from "@/components/groups/internal/SeasonsPanel";
import { GroupComparePanel } from "@/components/groups/internal/GroupComparePanel";
import { AdminPanel } from "@/components/groups/internal/AdminPanel";

export const Route = createFileRoute("/groups/$groupId/")({
  head: ({ params }) => {
    const url = `https://rankmymatch.app/groups/${params.groupId}`;
    const ogImage = `/api/og/group/${params.groupId}`;
    return {
      meta: [
        { title: "Grupo — RankMyMatch" },
        { name: "description", content: "Veja ranking, temporadas e rodadas deste grupo no RankMyMatch." },
        { property: "og:title", content: "Grupo no RankMyMatch" },
        { property: "og:description", content: "Ranking, temporadas e rodadas em tempo real." },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: ogImage },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: ogImage },
        { name: "robots", content: "index, follow" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SportsTeam",
            name: "Grupo RankMyMatch",
            url,
            image: `https://rankmymatch.app${ogImage}`,
            sport: ["Padel", "Beach Tennis", "Tennis"],
          }),
        },
      ],
    };
  },
  component: GroupDetailPage,
  validateSearch: (search: Record<string, unknown>): { view?: GroupView } => ({
    view: typeof search.view === "string" ? (search.view as GroupView) : undefined,
  }),
});

function GroupDetailPage() {
  const { groupId } = Route.useParams();
  const search = Route.useSearch();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const {
    group,
    memberCount,
    members,
    myRole,
    isAdmin,
    isCreator,
    pendingRequests,
    isLoading,
    refresh,
  } = useGroupDetail(groupId);
  const { pendingMatch, refresh: refreshPending } = usePendingMatch(groupId);

  const [view, setView] = useState<GroupView>(search.view || "overview");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [memberShareOpen, setMemberShareOpen] = useState(false);
  const [pendingCompareIds, setPendingCompareIds] = useState<string[] | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [addPlaceholderOpen, setAddPlaceholderOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [searchUserOpen, setSearchUserOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [leavingLoading, setLeavingLoading] = useState(false);
  const [mergeFormerMember, setMergeFormerMember] = useState<any>(null);

  const [placeholderUserIds, setPlaceholderUserIds] = useState<Set<string>>(new Set());
  const [rankingData, setRankingData] = useState<
    Record<string, { rating: number; position: number | null; matches_played: number; matches_won: number }>
  >({});
  const [commentCount, setCommentCount] = useState(0);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumDaysLeft, setPremiumDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("group_subscriptions")
      .select("status, expires_at")
      .eq("group_id", groupId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) { setIsPremium(false); setPremiumDaysLeft(null); return; }
        const active = data.status && data.status !== "free" && data.status !== "cancelled";
        const notExpired = !data.expires_at || new Date(data.expires_at) > new Date();
        const premium = Boolean(active && notExpired);
        setIsPremium(premium);
        if (premium && data.expires_at) {
          const days = Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / 86400000);
          setPremiumDaysLeft(days <= 14 ? days : null);
        } else {
          setPremiumDaysLeft(null);
        }
      });
    return () => { cancelled = true; };
  }, [groupId]);

  const rivalry = isRivalryGroup(group);
  const isMember = !!myRole;

  // Sync view → URL
  const handleSelectView = (v: GroupView) => {
    setView(v);
    navigate({ to: "/groups/$groupId", params: { groupId }, search: { view: v }, replace: true });
  };

  const handleCompareFromOverview = (a: string, b: string) => {
    setPendingCompareIds([a, b]);
    handleSelectView("compare");
  };

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
        (snaps || []).forEach((s) => {
          map[s.user_id] = s;
        });
        setRankingData(map);
      }
    };
    loadRanking();
  }, [groupId]);

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

  const hasPlaceholders = placeholderUserIds.size > 0;
  const activeMembers = useMemo(
    () => members.filter((m) => (m as any).status === "active"),
    [members],
  );
  const formerMembers = useMemo(
    () => members.filter((m) => (m as any).status !== "active"),
    [members],
  );

  if (isLoading) return <TrophyLoadingBar />;

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
      `Desvincular ${memberName || "este membro"} do grupo?\n\nO acesso ao grupo será revogado, mas o nome continuará aparecendo em rankings, partidas e históricos.`,
    );
    if (!ok) return;
    try {
      await removeMember(memberId);
      toast.success("Membro desvinculado");
      refresh();
    } catch {
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
    } catch {
      toast.error("Erro ao sair do grupo");
    } finally {
      setLeavingLoading(false);
      setLeaveDialogOpen(false);
    }
  };

  // Non-member view (visiting public group)
  if (isAuthenticated && !isMember) {
    return (
      <NonMemberView
        group={group}
        groupId={groupId}
        memberCount={memberCount}
        rivalry={rivalry}
        hasPlaceholders={hasPlaceholders}
        isPremium={isPremium}
        onJoin={() => setJoinDialogOpen(true)}
        onClaim={() => setClaimOpen(true)}
        joinDialog={
          user && (
            <JoinGroupDialog
              open={joinDialogOpen}
              onOpenChange={setJoinDialogOpen}
              groupId={groupId}
              isPublicGroup={group.is_public}
              userId={user.id}
              onJoined={refresh}
            />
          )
        }
        claimDialog={
          user && (
            <ClaimPlayerDialog
              open={claimOpen}
              onOpenChange={setClaimOpen}
              groupId={groupId}
              claimerUserId={user.id}
              onClaimed={refresh}
            />
          )
        }
      />
    );
  }

  // Member view
  const badges: SidebarBadges = {
    pendingRequests: pendingRequests.length,
    newComments: commentCount,
  };

  const memberShareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/groups/${groupId}`
    : `https://rankmymatch.app/groups/${groupId}`;

  const sidebarProps = {
    groupName: group.name,
    groupImage: group.image_url,
    memberCount,
    isAdmin,
    view,
    onSelect: handleSelectView,
    badges,
    onShareClick: () => setMemberShareOpen(true),
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1400px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 border-r border-border/60 bg-card/30 lg:block">
          <GroupInternalSidebar {...sidebarProps} />
        </aside>

        {/* Mobile drawer */}
        <GroupInternalSidebarDrawer
          {...sidebarProps}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />

        {/* Main content */}
        <main className="min-w-0 flex-1 overflow-x-hidden pb-28">
          {/* Top bar (mobile) */}
          <div className="flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
              aria-label="Abrir menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <Link
              to="/groups"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate font-display text-sm font-bold text-foreground">{group.name}</h1>
                {group.is_public ? (
                  <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                {isPremium && (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--rank-gold)]/15 px-1.5 py-0.5 text-[9px] font-bold text-[var(--rank-gold)] ring-1 ring-[var(--rank-gold)]/40"
                    title={premiumDaysLeft != null ? `Assinatura expira em ${premiumDaysLeft} dia${premiumDaysLeft === 1 ? "" : "s"}` : undefined}
                  >
                    <Crown className="h-2.5 w-2.5" />
                    PREMIUM
                    {premiumDaysLeft != null && (
                      <span className="ml-0.5 rounded-full bg-[var(--rank-gold)]/25 px-1 text-[8px] font-bold">
                        {premiumDaysLeft}d
                      </span>
                    )}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">{memberCount} membros</p>
            </div>
            <button
              onClick={() => setInviteOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
              aria-label="Convidar"
            >
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="min-w-0 px-4 py-5 lg:px-8 lg:py-6">
            {/* Pending match alert (always visible at top) */}
            {pendingMatch && (
              <div className="mb-4">
                <PendingMatchCard
                  match={pendingMatch}
                  onScoreSaved={() => {
                    refreshPending();
                    refresh();
                  }}
                  showGroupName={false}
                  isAdmin={isAdmin}
                />
              </div>
            )}

            {/* Rivalry CTA (always visible at top for rivalry groups) */}
            {rivalry && activeMembers.length >= 2 && (
              <div className="mb-4">
                <Link
                  to="/groups/$groupId/duel"
                  params={{ groupId }}
                  className="group relative block overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-info/10 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
                      <Swords className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Página do Duelo</p>
                      <p className="truncate font-display text-sm font-bold text-foreground">
                        Retrospecto e estatísticas comparativas
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-primary" />
                  </div>
                </Link>
              </div>
            )}

            {/* View content */}
            {view === "overview" && (
              <GroupOverviewPanel
                groupId={groupId}
                groupName={group.name}
                groupImage={group.image_url}
                description={group.description}
                isAdmin={isAdmin}
                onGotoMembers={() => handleSelectView("members")}
                onGotoResults={() => handleSelectView("seasons")}
                onCompare={handleCompareFromOverview}
              />
            )}

            {view === "members" && <MembersPanel groupId={groupId} />}

            {view === "seasons" && <SeasonsPanel groupId={groupId} isAdmin={isAdmin} />}

            {view === "compare" && (
              <GroupComparePanel
                groupId={groupId}
                initialPick={pendingCompareIds}
                onConsumeInitial={() => setPendingCompareIds(null)}
              />
            )}

            {view === "feed" && (
              <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  O feed completo está em uma página dedicada para melhor experiência.
                </p>
                <Link
                  to="/groups/$groupId/feed"
                  params={{ groupId }}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
                >
                  Abrir feed do grupo
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}

            {view === "admin" && isAdmin && (
              <AdminPanel
                group={group}
                isCreator={isCreator}
                onSaved={refresh}
                onShareInvite={() => setInviteOpen(true)}
                pendingRequestsCount={pendingRequests.length}
              />
            )}

            {/* Pending requests are now handled inside AdminPanel > Membros section */}


            {/* Leave group (non-creator) */}
            {isMember && !isCreator && view === "overview" && (
              <div className="mt-6">
                <button
                  onClick={handleLeaveClick}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sair do grupo
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Dialogs */}
      <InviteLinkDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        groupId={groupId}
        isAdmin={isAdmin}
      />

      <MergeMembersDialog
        open={!!mergeFormerMember}
        onOpenChange={(o) => {
          if (!o) setMergeFormerMember(null);
        }}
        groupId={groupId}
        formerMember={mergeFormerMember}
        activeMembers={activeMembers as any}
        onMerged={() => {
          setMergeFormerMember(null);
          refresh();
        }}
      />

      {isAdmin && user && (
        <AddPlaceholderPlayerDialog
          open={addPlaceholderOpen}
          onOpenChange={setAddPlaceholderOpen}
          groupId={groupId}
          adminUserId={user.id}
          onAdded={refresh}
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

      <ShareGroupDialog
        open={memberShareOpen}
        onOpenChange={setMemberShareOpen}
        url={memberShareUrl}
        groupName={group.name}
        groupId={groupId}
        isAdmin={isAdmin}
      />

      {/* Leave dialog */}
      {leaveDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setLeaveDialogOpen(false)}
          />
          <div className="relative w-[90%] max-w-sm rounded-3xl border border-border bg-card p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <h3 className="font-display text-base font-bold text-foreground">Sair do grupo?</h3>
              <p className="text-sm text-muted-foreground">
                {hasResults ? (
                  <>
                    Seus jogos cadastrados continuarão no ranking como{" "}
                    <strong className="text-foreground">anônimo</strong>. Você{" "}
                    <strong className="text-foreground">não poderá voltar</strong> a este grupo, a não
                    ser que receba um convite direto do admin.
                  </>
                ) : (
                  "Tem certeza que deseja sair deste grupo?"
                )}
              </p>
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
    </div>
  );
}

/* ============================================================ */
/* Non-member view: simple landing with join/claim buttons      */
/* ============================================================ */

function NonMemberView({
  group,
  groupId,
  memberCount,
  rivalry,
  hasPlaceholders,
  isPremium,
  onJoin,
  onClaim,
  joinDialog,
  claimDialog,
}: {
  group: any;
  groupId: string;
  memberCount: number;
  rivalry: boolean;
  hasPlaceholders: boolean;
  isPremium: boolean;
  onJoin: () => void;
  onClaim: () => void;
  joinDialog: React.ReactNode;
  claimDialog: React.ReactNode;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/groups/${groupId}`
    : `https://rankmymatch.app/groups/${groupId}`;
  const isPublic = group.visibility === "public" || group.is_public;

  return (
    <div className="min-h-screen bg-background pb-28">
      {group.image_url && (
        <div className="relative h-36 w-full">
          <img
            src={group.image_url}
            alt={group.name}
            className="h-full w-full object-cover object-top"
          />
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
              {isPremium && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--rank-gold)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--rank-gold)] ring-1 ring-[var(--rank-gold)]/40">
                  <Crown className="h-3 w-3" />
                  PREMIUM
                </span>
              )}
              {rivalry && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  Rivalidade
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{memberCount} membros ativos</p>
          </div>
          {isPublic && (
            <button
              onClick={() => setShareOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card transition hover:bg-accent"
              aria-label="Compartilhar grupo"
              title="Compartilhar grupo"
            >
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </header>

      {isPublic && (
        <ShareGroupDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          url={shareUrl}
          groupName={group.name}
          groupId={groupId}
        />
      )}

      {group.description && (
        <div className="px-5 pb-4">
          <p className="text-sm text-muted-foreground">{group.description}</p>
        </div>
      )}

      <div className="px-5">
        <div className={`grid gap-3 ${hasPlaceholders ? "grid-cols-2" : "grid-cols-1"}`}>
          <button
            onClick={onJoin}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-primary p-4 text-primary-foreground transition-transform active:scale-95"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-foreground/15">
              <UserPlus className="h-6 w-6" />
            </div>
            <span className="text-center text-sm font-bold leading-tight">
              {group.is_public ? "Entrar no grupo" : "Solicitar entrada"}
            </span>
          </button>
          {hasPlaceholders && (
            <button
              onClick={onClaim}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-primary transition-transform active:scale-95"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Link2 className="h-6 w-6" />
              </div>
              <span className="text-center text-sm font-bold leading-tight text-foreground">
                Entrar e vincular
              </span>
            </button>
          )}
        </div>
      </div>

      {joinDialog}
      {claimDialog}
    </div>
  );
}
