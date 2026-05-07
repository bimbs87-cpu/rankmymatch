import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAppAdmin } from "@/hooks/use-app-admin";
import {
  useGroupDetail,
  removeMember,
  hardRemoveMember,
  updateMemberRole,
} from "@/hooks/use-groups";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerAvatarLink } from "@/components/PlayerProfileViewer";
import { PlayerClaimsManager } from "@/components/PlayerClaimsManager";
import { MergeMembersDialog } from "@/components/MergeMembersDialog";
import { AddPlaceholderPlayerDialog } from "@/components/AddPlaceholderPlayerDialog";
import { SearchUserDialog } from "@/components/SearchUserDialog";
import { InviteLinkDialog } from "@/components/InviteLinkDialog";
import { ClaimInviteShareDialog } from "@/components/ClaimInviteShareDialog";
import {
  Search, Filter, ArrowUpDown, KeyRound, Shield, Ghost, UserMinus, Pencil, GitMerge,
  Check, X, Trophy, ChevronRight, UserPlus, Share2, Crown, Flame, MessageCircle,
  MailCheck, RotateCcw, Send, Trash2, Loader2,
} from "lucide-react";
import { toast } from "sonner";

type Filter = "all" | "active" | "no_account" | "former" | "admins";
type SortBy = "elo" | "wins" | "alpha" | "presence" | "no_invite_first";

interface Props {
  groupId: string;
}

interface PendingInvite {
  id: string;
  code: string;
  expires_at: string | null;
}

export function MembersPanel({ groupId }: Props) {
  const { user } = useAuth();
  const { members, isAdmin, refresh } = useGroupDetail(groupId);
  const { isAppAdmin } = useAppAdmin();
  const [rankingData, setRankingData] = useState<Record<string, { rating: number; position: number | null; matches_played: number; matches_won: number }>>({});
  const [presenceData, setPresenceData] = useState<Record<string, number>>({});
  const [placeholderUserIds, setPlaceholderUserIds] = useState<Set<string>>(new Set());
  // Map placeholder user_id -> active claim invite (if any)
  const [pendingInvites, setPendingInvites] = useState<Record<string, PendingInvite>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("elo");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeFormerMember, setMergeFormerMember] = useState<typeof members[number] | null>(null);
  const [renamingUserId, setRenamingUserId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addPlaceholderOpen, setAddPlaceholderOpen] = useState(false);
  const [searchUserOpen, setSearchUserOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [groupName, setGroupName] = useState<string>("");
  const [shareDialogTargets, setShareDialogTargets] = useState<{ user_id: string; name: string }[]>([]);

  // Load group name
  useEffect(() => {
    supabase.from("groups").select("name").eq("id", groupId).maybeSingle()
      .then(({ data }) => { if (data?.name) setGroupName(data.name); });
  }, [groupId]);

  // Load active claim invites for this group
  const refreshPendingInvites = async () => {
    const { data } = await supabase
      .from("invite_links")
      .select("id, code, expires_at, claim_placeholder_user_id, max_uses, use_count, is_active")
      .eq("group_id", groupId)
      .eq("is_active", true)
      .not("claim_placeholder_user_id", "is", null);
    const map: Record<string, PendingInvite> = {};
    (data || []).forEach((row) => {
      const usable = row.use_count < (row.max_uses ?? 1)
        && (!row.expires_at || new Date(row.expires_at) > new Date());
      if (usable && row.claim_placeholder_user_id) {
        map[row.claim_placeholder_user_id] = {
          id: row.id,
          code: row.code,
          expires_at: row.expires_at,
        };
      }
    });
    setPendingInvites(map);
  };

  useEffect(() => {
    refreshPendingInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Load ranking data
  useEffect(() => {
    (async () => {
      const { data: season } = await supabase
        .from("seasons").select("id")
        .eq("group_id", groupId).eq("status", "active")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (season) {
        const { data: snaps } = await supabase
          .from("ranking_snapshots")
          .select("user_id, rating, position, matches_played, matches_won")
          .eq("season_id", season.id);
        const map: Record<string, { rating: number; position: number | null; matches_played: number; matches_won: number }> = {};
        (snaps || []).forEach((s) => { map[s.user_id] = s; });
        setRankingData(map);

        const { data: rounds } = await supabase
          .from("rounds").select("id").eq("group_id", groupId);
        if (rounds && rounds.length) {
          const { data: pres } = await supabase
            .from("round_presence").select("user_id, status")
            .in("round_id", rounds.map((r) => r.id))
            .eq("status", "confirmed");
          const pmap: Record<string, number> = {};
          (pres || []).forEach((p) => { pmap[p.user_id] = (pmap[p.user_id] || 0) + 1; });
          setPresenceData(pmap);
        }
      }
    })();
  }, [groupId]);

  // Detect placeholders
  useEffect(() => {
    if (!members.length) return;
    const userIds = members.map((m) => m.user_id);
    supabase.from("user_profiles").select("user_id").in("user_id", userIds).eq("is_placeholder", true)
      .then(({ data }) => setPlaceholderUserIds(new Set((data || []).map((p) => p.user_id))));
  }, [members]);

  const filtered = useMemo(() => {
    let list = members.slice();
    if (filter === "active") list = list.filter((m) => (m as { status?: string }).status === "active");
    else if (filter === "former") list = list.filter((m) => (m as { status?: string }).status !== "active");
    else if (filter === "admins") list = list.filter((m) => m.role === "admin" || m.role === "creator");
    else if (filter === "no_account") list = list.filter((m) => placeholderUserIds.has(m.user_id));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) =>
        (m.profile?.name || "").toLowerCase().includes(q) ||
        (m.profile?.nickname || "").toLowerCase().includes(q),
      );
    }
    const isFormer = (m: { status?: string }) => m.status !== "active";
    list.sort((a, b) => {
      if (isFormer(a) !== isFormer(b)) return isFormer(a) ? 1 : -1;
      if (sortBy === "no_invite_first") {
        const aPh = placeholderUserIds.has(a.user_id);
        const bPh = placeholderUserIds.has(b.user_id);
        const aNoInvite = aPh && !pendingInvites[a.user_id];
        const bNoInvite = bPh && !pendingInvites[b.user_id];
        if (aNoInvite !== bNoInvite) return aNoInvite ? -1 : 1;
        // tie-break: placeholders before others, then by elo desc
        if (aPh !== bPh) return aPh ? -1 : 1;
        return (rankingData[b.user_id]?.rating || 0) - (rankingData[a.user_id]?.rating || 0);
      }
      if (sortBy === "alpha") return (a.profile?.name || "").localeCompare(b.profile?.name || "");
      if (sortBy === "wins") return (rankingData[b.user_id]?.matches_won || 0) - (rankingData[a.user_id]?.matches_won || 0);
      if (sortBy === "presence") return (presenceData[b.user_id] || 0) - (presenceData[a.user_id] || 0);
      return (rankingData[b.user_id]?.rating || 0) - (rankingData[a.user_id]?.rating || 0);
    });
    return list;
  }, [members, filter, search, sortBy, rankingData, presenceData, placeholderUserIds, pendingInvites]);

  // Placeholders visible in current filtered view (for bulk invite)
  const visiblePlaceholders = useMemo(
    () => filtered.filter((m) => placeholderUserIds.has(m.user_id) && (m as { status?: string }).status === "active"),
    [filtered, placeholderUserIds],
  );

  // Of the selected, how many are placeholders (active)?
  const selectedPlaceholders = useMemo(() => {
    return filtered.filter((m) =>
      selectedIds.has(m.id) && placeholderUserIds.has(m.user_id) && (m as { status?: string }).status === "active",
    );
  }, [filtered, selectedIds, placeholderUserIds]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkRemove = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Desvincular ${selectedIds.size} membros?`)) return;
    for (const id of selectedIds) {
      await removeMember(id).catch(() => {});
    }
    toast.success(`${selectedIds.size} membros desvinculados`);
    setSelectedIds(new Set());
    refresh();
  };

  const handleBulkPromote = async (role: "admin" | "member") => {
    if (!selectedIds.size) return;
    for (const id of selectedIds) {
      await updateMemberRole(id, role).catch(() => {});
    }
    toast.success("Funções atualizadas");
    setSelectedIds(new Set());
    refresh();
  };

  const handleBulkInviteSelected = () => {
    if (!selectedPlaceholders.length) return;
    setShareDialogTargets(
      selectedPlaceholders.map((m) => ({ user_id: m.user_id, name: m.profile?.name || "Jogador" })),
    );
  };

  const handleInviteAllPlaceholders = () => {
    // Only those WITHOUT an active invite already (avoid spamming the same person)
    const list = visiblePlaceholders.filter((m) => !pendingInvites[m.user_id]);
    if (!list.length) {
      toast.info("Todos os jogadores sem conta já têm convite ativo");
      return;
    }
    setShareDialogTargets(list.map((m) => ({ user_id: m.user_id, name: m.profile?.name || "Jogador" })));
  };

  const handleInviteSingle = (placeholderUserId: string, name: string) => {
    setShareDialogTargets([{ user_id: placeholderUserId, name }]);
  };

  const handleRevokeInvite = async (placeholderUserId: string, name: string) => {
    const invite = pendingInvites[placeholderUserId];
    if (!invite) return;
    if (!confirm(`Revogar convite de ${name}? O link enviado deixará de funcionar.`)) return;
    const { error } = await supabase
      .from("invite_links")
      .update({ is_active: false })
      .eq("id", invite.id);
    if (error) { toast.error("Erro ao revogar"); return; }
    toast.success("Convite revogado");
    refreshPendingInvites();
  };

  const handleStartRename = (uid: string, name: string) => {
    setRenamingUserId(uid); setRenameValue(name);
  };

  const handleSaveRename = async () => {
    if (!renamingUserId) return;
    if (!renameValue.trim()) { toast.error("Nome obrigatório"); return; }
    setRenameSaving(true);
    // Also clear nickname — admin renames should reset any old test nickname so the
    // new name surfaces everywhere (UI prefers nickname when present).
    const { error } = await supabase
      .from("user_profiles")
      .update({ name: renameValue.trim(), nickname: null })
      .eq("user_id", renamingUserId);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Nome atualizado"); setRenamingUserId(null); refresh(); }
    setRenameSaving(false);
  };

  const handleRemove = async (memberId: string, name?: string) => {
    if (!confirm(`Desvincular ${name || "este membro"}?`)) return;
    try { await removeMember(memberId); toast.success("Desvinculado"); refresh(); }
    catch { toast.error("Erro"); }
  };

  const handleHardRemove = async (memberId: string, name?: string) => {
    if (removingId) return; // guard against repeat clicks while a removal is in flight
    const ok = confirm(
      `Remover ${name || "este jogador"} do grupo definitivamente?\n\n` +
      `O jogador deixa de aparecer na lista de membros.\n` +
      `O histórico de partidas é preservado.`,
    );
    if (!ok) return;
    setRemovingId(memberId);
    try {
      await hardRemoveMember(memberId);
      toast.success("Removido do grupo");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    } finally {
      setRemovingId(null);
    }
  };

  const FILTER_OPTS: { id: Filter; label: string; count?: number }[] = [
    { id: "all", label: "Todos", count: members.length },
    { id: "active", label: "Ativos", count: members.filter((m) => (m as { status?: string }).status === "active").length },
    { id: "no_account", label: "Sem conta", count: placeholderUserIds.size },
    { id: "former", label: "Ex-membros", count: members.filter((m) => (m as { status?: string }).status !== "active").length },
    { id: "admins", label: "Admins", count: members.filter((m) => m.role === "admin" || m.role === "creator").length },
  ];

  const SORT_OPTS: { id: SortBy; label: string }[] = [
    { id: "elo", label: "Elo" },
    { id: "wins", label: "Vitórias" },
    { id: "presence", label: "Presença" },
    { id: "alpha", label: "A-Z" },
    { id: "no_invite_first", label: "Sem convite no topo" },
  ];

  const activeMembers = members.filter((m) => (m as { status?: string }).status === "active");

  const pendingCount = Object.keys(pendingInvites).length;
  const placeholdersWithoutInvite = visiblePlaceholders.filter((m) => !pendingInvites[m.user_id]).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="space-y-3 rounded-3xl border border-border bg-card/40 p-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar membro..."
              className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-background px-1 py-1">
            <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="bg-transparent pr-2 text-xs font-medium text-foreground focus:outline-none"
            >
              {SORT_OPTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Filter className="mt-1 h-3.5 w-3.5 text-muted-foreground" />
          {FILTER_OPTS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                filter === f.id ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label} {f.count !== undefined && <span className="opacity-70">({f.count})</span>}
            </button>
          ))}
        </div>

        {/* Bulk invite all placeholders helper */}
        {isAdmin && filter === "no_account" && placeholdersWithoutInvite > 0 && (
          <button
            onClick={handleInviteAllPlaceholders}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-success/10 px-3 py-2 text-xs font-bold text-success hover:bg-success/15"
          >
            <Send className="h-3.5 w-3.5" />
            Convidar todos os {placeholdersWithoutInvite} sem convite
          </button>
        )}
      </div>

      {/* Bulk actions bar */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-2.5">
          <span className="text-xs font-semibold text-primary">
            {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
            {selectedPlaceholders.length > 0 && (
              <span className="ml-1 opacity-70">({selectedPlaceholders.length} sem conta)</span>
            )}
          </span>
          <div className="flex flex-wrap gap-2">
            {selectedPlaceholders.length > 0 && (
              <button
                onClick={handleBulkInviteSelected}
                className="flex items-center gap-1 rounded-full bg-success px-3 py-1 text-[11px] font-bold text-success-foreground"
              >
                <MessageCircle className="h-3 w-3" />
                Convidar {selectedPlaceholders.length}
              </button>
            )}
            <button onClick={() => handleBulkPromote("admin")} className="rounded-full bg-info/15 px-3 py-1 text-[11px] font-semibold text-info">Promover</button>
            <button onClick={() => handleBulkPromote("member")} className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground">Rebaixar</button>
            <button onClick={handleBulkRemove} className="rounded-full bg-destructive/15 px-3 py-1 text-[11px] font-semibold text-destructive">Desvincular</button>
            <button onClick={() => setSelectedIds(new Set())} className="rounded-full bg-muted px-2 py-1 text-muted-foreground"><X className="h-3 w-3" /></button>
          </div>
        </div>
      )}

      {/* Pending invites summary */}
      {isAdmin && pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-warning/30 bg-warning/5 px-3 py-2">
          <MailCheck className="h-3.5 w-3.5 text-warning flex-shrink-0" />
          <span className="text-[11px] text-foreground">
            <strong className="text-warning">{pendingCount}</strong> convite{pendingCount > 1 ? "s" : ""} de vinculação aguardando uso
          </span>
        </div>
      )}

      {/* Members list */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card/40 divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">Nenhum membro encontrado</div>
        ) : filtered.map((m) => {
          const rank = rankingData[m.user_id];
          const presence = presenceData[m.user_id] || 0;
          const isFormer = (m as { status?: string }).status !== "active";
          const isMe = user?.id === m.user_id;
          const selected = selectedIds.has(m.id);
          const winRate = rank && rank.matches_played > 0 ? Math.round((rank.matches_won / rank.matches_played) * 100) : null;
          const isPlaceholder = !isFormer && placeholderUserIds.has(m.user_id);
          const pendingInvite = isPlaceholder ? pendingInvites[m.user_id] : undefined;
          return (
            <div
              key={m.id}
              className={`flex items-center gap-3 px-3 py-3 transition-colors ${selected ? "bg-primary/5" : isFormer ? "bg-muted/10" : ""}`}
            >
              {isAdmin && !isFormer && (
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSelect(m.id)}
                  className="h-3.5 w-3.5 accent-primary"
                />
              )}
              {!isFormer && rank?.position ? (
                <span className="w-5 text-center text-xs font-bold text-muted-foreground">{rank.position}</span>
              ) : (
                <span className="w-5 text-center text-[10px] text-muted-foreground/40">—</span>
              )}
              <PlayerAvatarLink
                userId={isPlaceholder || isFormer ? undefined : m.user_id}
                ariaLabel={`Ver perfil de ${m.profile?.name || "jogador"}`}
              >
                <PlayerAvatar
                  avatarUrl={isFormer ? null : m.profile?.avatar_url}
                  name={isFormer ? "?" : (m.profile?.name || "?")}
                  size="lg"
                  dimmed={isFormer}
                />
              </PlayerAvatarLink>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(isFormer || isPlaceholder || isAppAdmin) && isAdmin && renamingUserId === m.user_id ? (
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveRename(); if (e.key === "Escape") setRenamingUserId(null); }}
                      autoFocus disabled={renameSaving}
                      className="flex-1 min-w-0 rounded-lg border border-primary/40 bg-background px-2 py-1 text-sm focus:outline-none"
                    />
                  ) : (
                    <span className={`text-sm font-medium truncate ${isFormer ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {m.profile?.nickname || m.profile?.name || "Jogador"}
                    </span>
                  )}
                  {!isFormer && m.role === "creator" && <KeyRound className="h-3 w-3 text-rank-gold flex-shrink-0" />}
                  {!isFormer && m.role === "admin" && <Shield className="h-3 w-3 text-info flex-shrink-0" />}
                  {isMe && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">Você</span>}
                  {isPlaceholder && (
                    <span className="flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground flex-shrink-0">
                      <Ghost className="h-2.5 w-2.5" />Sem conta
                    </span>
                  )}
                  {isPlaceholder && pendingInvite && (() => {
                    const expiresLabel = pendingInvite.expires_at
                      ? (() => {
                          const ms = new Date(pendingInvite.expires_at!).getTime() - Date.now();
                          const days = Math.ceil(ms / 86400000);
                          if (days <= 0) return "expira hoje";
                          if (days === 1) return "expira em 1d";
                          return `expira em ${days}d`;
                        })()
                      : "sem expiração";
                    return (
                      <span
                        className="flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold text-warning flex-shrink-0"
                        title={pendingInvite.expires_at ? `Expira em ${new Date(pendingInvite.expires_at).toLocaleDateString("pt-BR")}` : "Sem expiração"}
                      >
                        <MailCheck className="h-2.5 w-2.5" />Convite · {expiresLabel}
                      </span>
                    );
                  })()}
                  {isFormer && (
                    <span className="flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground flex-shrink-0">
                      <UserMinus className="h-2.5 w-2.5" />Ex-membro
                    </span>
                  )}
                </div>
                {!isFormer && rank && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{Math.round(rank.rating)} Elo</span>
                    <span>·</span>
                    <span>{rank.matches_won}V {rank.matches_played - rank.matches_won}D</span>
                    {winRate !== null && <span className="rounded-full bg-success/10 px-1.5 py-0.5 font-semibold text-success">{winRate}%</span>}
                    {presence > 0 && <span className="flex items-center gap-0.5"><Flame className="h-2.5 w-2.5 text-orange-500" />{presence}</span>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!isFormer && rank && (
                  <span className="hidden sm:block text-xs font-bold text-primary">{Math.round(rank.rating)}</span>
                )}
                {isAdmin && isFormer && (
                  renamingUserId === m.user_id ? (
                    <>
                      <button onClick={handleSaveRename} disabled={renameSaving} className="rounded-lg bg-success/10 p-1.5 text-success"><Check className="h-3 w-3" /></button>
                      <button onClick={() => setRenamingUserId(null)} className="rounded-lg bg-muted p-1.5 text-muted-foreground"><X className="h-3 w-3" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setMergeFormerMember(m)} className="rounded-lg bg-primary/10 p-1.5 text-primary" title="Mesclar"><GitMerge className="h-3 w-3" /></button>
                      <button onClick={() => handleStartRename(m.user_id, m.profile?.name || "")} className="rounded-lg bg-muted p-1.5 text-muted-foreground" title="Renomear"><Pencil className="h-3 w-3" /></button>
                      <button
                        onClick={() => handleHardRemove(m.id, m.profile?.name)}
                        disabled={removingId === m.id}
                        aria-busy={removingId === m.id}
                        className="rounded-lg bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20 disabled:opacity-60 disabled:cursor-not-allowed"
                        title={removingId === m.id ? "Removendo…" : "Remover do grupo definitivamente"}
                      >
                        {removingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </button>
                    </>
                  )
                )}
                {isAdmin && isPlaceholder && (
                  renamingUserId === m.user_id ? (
                    <>
                      <button onClick={handleSaveRename} disabled={renameSaving} className="rounded-lg bg-success/10 p-1.5 text-success" title="Salvar"><Check className="h-3 w-3" /></button>
                      <button onClick={() => setRenamingUserId(null)} className="rounded-lg bg-muted p-1.5 text-muted-foreground" title="Cancelar"><X className="h-3 w-3" /></button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleStartRename(m.user_id, m.profile?.name || "")}
                        className="rounded-lg bg-muted p-1.5 text-muted-foreground hover:bg-muted/70"
                        title="Renomear jogador"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {pendingInvite ? (
                        <>
                          <button
                            onClick={() => handleInviteSingle(m.user_id, m.profile?.name || "Jogador")}
                            className="flex items-center gap-1 rounded-lg bg-warning/10 px-2 py-1.5 text-[10px] font-semibold text-warning hover:bg-warning/20"
                            title="Reenviar convite"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span className="hidden sm:inline">Reenviar</span>
                          </button>
                          <button
                            onClick={() => handleRevokeInvite(m.user_id, m.profile?.name || "Jogador")}
                            className="rounded-lg bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20"
                            title="Revogar convite"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleInviteSingle(m.user_id, m.profile?.name || "Jogador")}
                          className="flex items-center gap-1 rounded-lg bg-success/10 px-2 py-1.5 text-[10px] font-semibold text-success hover:bg-success/20"
                          title="Convidar pelo WhatsApp"
                        >
                          <MessageCircle className="h-3 w-3" />
                          <span className="hidden sm:inline">Convidar</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleHardRemove(m.id, m.profile?.name)}
                        disabled={removingId === m.id}
                        aria-busy={removingId === m.id}
                        className="rounded-lg bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20 disabled:opacity-60 disabled:cursor-not-allowed"
                        title={removingId === m.id ? "Removendo…" : "Remover do grupo definitivamente"}
                      >
                        {removingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </button>
                    </>
                  )
                )}
                {isAdmin && !isFormer && !isMe && m.role !== "creator" && (
                  <>
                    {m.role === "member" ? (
                      <button onClick={() => updateMemberRole(m.id, "admin").then(() => { toast.success("Promovido"); refresh(); })} className="rounded-lg bg-info/10 p-1.5 text-info" title="Promover"><Shield className="h-3 w-3" /></button>
                    ) : (
                      <button onClick={() => updateMemberRole(m.id, "member").then(() => { toast.success("Rebaixado"); refresh(); })} className="rounded-lg bg-warning/10 p-1.5 text-warning" title="Rebaixar"><Crown className="h-3 w-3" /></button>
                    )}
                    <button onClick={() => handleRemove(m.id, m.profile?.name)} className="rounded-lg bg-destructive/10 p-1.5 text-destructive" title="Desvincular"><UserMinus className="h-3 w-3" /></button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          to="/ranking"
          className="flex items-center justify-between rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 to-primary/5 px-4 py-3"
        >
          <div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /><span className="text-sm font-bold">Ranking completo</span></div>
          <ChevronRight className="h-4 w-4 text-primary" />
        </Link>
        {isAdmin ? (
          <button
            onClick={() => setSearchUserOpen(true)}
            className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
          >
            <div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-foreground" /><span className="text-sm font-medium">Adicionar membro</span></div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ) : (
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
          >
            <div className="flex items-center gap-2"><Share2 className="h-4 w-4 text-foreground" /><span className="text-sm font-medium">Convidar</span></div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Admin extras */}
      {isAdmin && (
        <>
          <PlayerClaimsManager groupId={groupId} onResolved={refresh} />
          <div className="grid gap-2 sm:grid-cols-3">
            <button onClick={() => setSearchUserOpen(true)} className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 px-4 py-3 text-left">
              <Search className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Buscar usuário</span>
            </button>
            <button onClick={() => setAddPlaceholderOpen(true)} className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 px-4 py-3 text-left">
              <Ghost className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Sem conta</span>
            </button>
            <button onClick={() => setInviteOpen(true)} className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 px-4 py-3 text-left">
              <Share2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Link de convite</span>
            </button>
          </div>
        </>
      )}

      {/* Dialogs */}
      <MergeMembersDialog
        open={!!mergeFormerMember}
        onOpenChange={(o) => { if (!o) setMergeFormerMember(null); }}
        groupId={groupId}
        formerMember={mergeFormerMember as never}
        activeMembers={activeMembers as never}
        onMerged={() => { setMergeFormerMember(null); refresh(); }}
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
      <InviteLinkDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        groupId={groupId}
        isAdmin={isAdmin}
      />
      <ClaimInviteShareDialog
        open={shareDialogTargets.length > 0}
        onOpenChange={(o) => { if (!o) setShareDialogTargets([]); }}
        groupId={groupId}
        groupName={groupName}
        targets={shareDialogTargets}
        onSent={() => { refreshPendingInvites(); setSelectedIds(new Set()); }}
      />
    </div>
  );
}
