import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Inbox,
  Check,
  X,
  Filter,
  Loader2,
  UserPlus,
  Link2,
  CheckCheck,
  Bell,
  History,
  AlertTriangle,
  Undo2,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAdminPendingCount } from "@/hooks/use-admin-pending-count";
import { approveJoinRequest, rejectJoinRequest } from "@/hooks/use-groups";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/inbox")({
  head: () => ({
    meta: [
      { title: "Caixa do admin — RankMyMatch" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminInboxPage,
});

type Kind = "join_request" | "claim" | "match_result";

interface PendingItem {
  id: string;
  kind: Kind;
  groupId: string;
  groupName: string;
  requesterUserId: string;
  requesterName: string;
  requesterAvatarUrl: string | null;
  targetPlayerId: string | null;
  targetPlayerName: string | null;
  message: string | null;
  createdAt: string;
  /** match_result extras (kind === "match_result") */
  matchId?: string;
  seasonId?: string;
  matchNumber?: number | null;
  roundNumber?: number | null;
  sets?: { setNumber: number; scoreA: number; scoreB: number }[];
}

interface ResolvedItem {
  id: string;
  kind: Kind;
  groupId: string;
  groupName: string;
  requesterName: string;
  requesterAvatarUrl: string | null;
  targetPlayerName: string | null;
  status: "approved" | "rejected";
  resolvedAt: string;
  resolvedByName: string | null;
}

const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

const OLD_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
const CRITICAL_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function ageLevel(createdAt: string): "fresh" | "old" | "critical" {
  const ms = Date.now() - new Date(createdAt).getTime();
  if (ms >= CRITICAL_THRESHOLD_MS) return "critical";
  if (ms >= OLD_THRESHOLD_MS) return "old";
  return "fresh";
}

function AdminInboxPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { adminGroupIds, refresh: refreshCount } = useAdminPendingCount();

  const [items, setItems] = useState<PendingItem[]>([]);
  const [resolved, setResolved] = useState<ResolvedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResolved, setLoadingResolved] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [ageFilter, setAgeFilter] = useState<"all" | "old" | "critical">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const loadAll = async () => {
    if (!user || !adminGroupIds.length) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Fetch matches in admin groups (needed to scope pending_match_results
      // and to attach round/match metadata for display).
      const { data: groupMatches } = await supabase
        .from("matches")
        .select("id, match_number, round_id, rounds!inner(id, round_number, season_id, group_id)")
        .in("rounds.group_id", adminGroupIds);

      const matchMeta = new Map<string, { matchNumber: number | null; roundNumber: number | null; seasonId: string | null; groupId: string }>();
      for (const m of (groupMatches || []) as any[]) {
        matchMeta.set(m.id, {
          matchNumber: m.match_number,
          roundNumber: m.rounds?.round_number ?? null,
          seasonId: m.rounds?.season_id ?? null,
          groupId: m.rounds?.group_id,
        });
      }
      const matchIds = [...matchMeta.keys()];

      const [reqsRes, claimsRes, groupsRes, prRes] = await Promise.all([
        supabase
          .from("group_join_requests")
          .select("id, group_id, user_id, claimed_player_id, message, created_at")
          .in("group_id", adminGroupIds)
          .eq("status", "pending"),
        supabase
          .from("player_claims")
          .select("id, group_id, claimer_user_id, placeholder_user_id, created_at")
          .in("group_id", adminGroupIds)
          .eq("status", "pending"),
        supabase.from("groups").select("id, name").in("id", adminGroupIds),
        matchIds.length
          ? supabase
              .from("pending_match_results")
              .select("id, match_id, submitted_by, sets, created_at")
              .in("match_id", matchIds)
              .eq("status", "pending")
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const reqs = reqsRes.data || [];
      const claims = claimsRes.data || [];
      const prs = (prRes.data || []) as any[];
      const groupNames = new Map(
        (groupsRes.data || []).map((g) => [g.id, g.name as string]),
      );

      const userIds = new Set<string>();
      for (const r of reqs) {
        userIds.add(r.user_id);
        if (r.claimed_player_id) userIds.add(r.claimed_player_id);
      }
      for (const c of claims) {
        userIds.add(c.claimer_user_id);
        userIds.add(c.placeholder_user_id);
      }
      for (const p of prs) userIds.add(p.submitted_by);

      const profileMap = new Map<
        string,
        { name: string; avatar_url: string | null }
      >();
      if (userIds.size) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, name, avatar_url")
          .in("user_id", [...userIds]);
        for (const p of profiles || []) {
          profileMap.set(p.user_id, {
            name: p.name,
            avatar_url: p.avatar_url,
          });
        }
      }

      const merged: PendingItem[] = [
        ...reqs.map((r): PendingItem => {
          const requester = profileMap.get(r.user_id);
          const target = r.claimed_player_id
            ? profileMap.get(r.claimed_player_id)
            : null;
          return {
            id: r.id,
            kind: "join_request",
            groupId: r.group_id,
            groupName: groupNames.get(r.group_id) || "Grupo",
            requesterUserId: r.user_id,
            requesterName: requester?.name || "Usuário",
            requesterAvatarUrl: requester?.avatar_url || null,
            targetPlayerId: r.claimed_player_id,
            targetPlayerName: target?.name || null,
            message: r.message || null,
            createdAt: r.created_at,
          };
        }),
        ...claims.map((c): PendingItem => {
          const requester = profileMap.get(c.claimer_user_id);
          const target = profileMap.get(c.placeholder_user_id);
          return {
            id: c.id,
            kind: "claim",
            groupId: c.group_id,
            groupName: groupNames.get(c.group_id) || "Grupo",
            requesterUserId: c.claimer_user_id,
            requesterName: requester?.name || "Usuário",
            requesterAvatarUrl: requester?.avatar_url || null,
            targetPlayerId: c.placeholder_user_id,
            targetPlayerName: target?.name || null,
            message: null,
            createdAt: c.created_at,
          };
        }),
        ...prs
          .filter((p) => matchMeta.has(p.match_id))
          .map((p): PendingItem => {
            const meta = matchMeta.get(p.match_id)!;
            const requester = profileMap.get(p.submitted_by);
            return {
              id: p.id,
              kind: "match_result",
              groupId: meta.groupId,
              groupName: groupNames.get(meta.groupId) || "Grupo",
              requesterUserId: p.submitted_by,
              requesterName: requester?.name || "Jogador",
              requesterAvatarUrl: requester?.avatar_url || null,
              targetPlayerId: null,
              targetPlayerName: null,
              message: null,
              createdAt: p.created_at,
              matchId: p.match_id,
              seasonId: meta.seasonId || undefined,
              matchNumber: meta.matchNumber,
              roundNumber: meta.roundNumber,
              sets: (p.sets || []) as { setNumber: number; scoreA: number; scoreB: number }[],
            };
          }),
      ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

      setItems(merged);
    } catch (err) {
      console.error("Erro ao carregar caixa do admin:", err);
      toast.error("Erro ao carregar solicitações");
    } finally {
      setLoading(false);
    }
  };

  const loadResolved = async () => {
    if (!user || !adminGroupIds.length) {
      setResolved([]);
      return;
    }
    setLoadingResolved(true);
    try {
      const cutoff = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const [reqsRes, claimsRes, groupsRes] = await Promise.all([
        supabase
          .from("group_join_requests")
          .select(
            "id, group_id, user_id, claimed_player_id, status, resolved_at, resolved_by",
          )
          .in("group_id", adminGroupIds)
          .in("status", ["approved", "rejected"])
          .gte("resolved_at", cutoff)
          .order("resolved_at", { ascending: false })
          .limit(100),
        supabase
          .from("player_claims")
          .select(
            "id, group_id, claimer_user_id, placeholder_user_id, status, resolved_at, resolved_by",
          )
          .in("group_id", adminGroupIds)
          .in("status", ["approved", "rejected"])
          .gte("resolved_at", cutoff)
          .order("resolved_at", { ascending: false })
          .limit(100),
        supabase.from("groups").select("id, name").in("id", adminGroupIds),
      ]);

      const reqs = reqsRes.data || [];
      const claims = claimsRes.data || [];
      const groupNames = new Map(
        (groupsRes.data || []).map((g) => [g.id, g.name as string]),
      );

      const userIds = new Set<string>();
      for (const r of reqs) {
        userIds.add(r.user_id);
        if (r.claimed_player_id) userIds.add(r.claimed_player_id);
        if (r.resolved_by) userIds.add(r.resolved_by);
      }
      for (const c of claims) {
        userIds.add(c.claimer_user_id);
        userIds.add(c.placeholder_user_id);
        if (c.resolved_by) userIds.add(c.resolved_by);
      }

      const profileMap = new Map<
        string,
        { name: string; avatar_url: string | null }
      >();
      if (userIds.size) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, name, avatar_url")
          .in("user_id", [...userIds]);
        for (const p of profiles || []) {
          profileMap.set(p.user_id, {
            name: p.name,
            avatar_url: p.avatar_url,
          });
        }
      }

      const merged: ResolvedItem[] = [
        ...reqs.map((r): ResolvedItem => {
          const requester = profileMap.get(r.user_id);
          const target = r.claimed_player_id
            ? profileMap.get(r.claimed_player_id)
            : null;
          const resolver = r.resolved_by ? profileMap.get(r.resolved_by) : null;
          return {
            id: r.id,
            kind: "join_request",
            groupId: r.group_id,
            groupName: groupNames.get(r.group_id) || "Grupo",
            requesterName: requester?.name || "Usuário",
            requesterAvatarUrl: requester?.avatar_url || null,
            targetPlayerName: target?.name || null,
            status: r.status as "approved" | "rejected",
            resolvedAt: r.resolved_at || new Date().toISOString(),
            resolvedByName: resolver?.name || null,
          };
        }),
        ...claims.map((c): ResolvedItem => {
          const requester = profileMap.get(c.claimer_user_id);
          const target = profileMap.get(c.placeholder_user_id);
          const resolver = c.resolved_by ? profileMap.get(c.resolved_by) : null;
          return {
            id: c.id,
            kind: "claim",
            groupId: c.group_id,
            groupName: groupNames.get(c.group_id) || "Grupo",
            requesterName: requester?.name || "Usuário",
            requesterAvatarUrl: requester?.avatar_url || null,
            targetPlayerName: target?.name || null,
            status: c.status as "approved" | "rejected",
            resolvedAt: c.resolved_at || new Date().toISOString(),
            resolvedByName: resolver?.name || null,
          };
        }),
      ].sort((a, b) => (a.resolvedAt < b.resolvedAt ? 1 : -1));

      setResolved(merged);
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
      toast.error("Erro ao carregar histórico");
    } finally {
      setLoadingResolved(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, adminGroupIds.join(",")]);

  useEffect(() => {
    if (tab === "history") void loadResolved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user?.id, adminGroupIds.join(",")]);

  const groupsForFilter = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) m.set(it.groupId, it.groupName);
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const lvl = ageLevel(it.createdAt);
      const okAge =
        ageFilter === "all" ||
        (ageFilter === "old" && (lvl === "old" || lvl === "critical")) ||
        (ageFilter === "critical" && lvl === "critical");
      return (
        (groupFilter === "all" || it.groupId === groupFilter) &&
        (kindFilter === "all" || it.kind === kindFilter) &&
        okAge
      );
    });
  }, [items, groupFilter, kindFilter, ageFilter]);

  const oldCount = useMemo(
    () =>
      items.filter((it) => {
        const l = ageLevel(it.createdAt);
        return l === "old" || l === "critical";
      }).length,
    [items],
  );

  const criticalCount = useMemo(
    () => items.filter((it) => ageLevel(it.createdAt) === "critical").length,
    [items],
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((i) => i.id)));
  };

  const approveOne = async (it: PendingItem) => {
    if (!user) return;
    if (it.kind === "join_request") {
      await approveJoinRequest(it.id, it.groupId, it.requesterUserId, user.id);
    } else if (it.kind === "claim") {
      const { error } = await supabase.rpc("merge_placeholder_player", {
        _placeholder_user_id: it.targetPlayerId!,
        _real_user_id: it.requesterUserId,
        _group_id: it.groupId,
      });
      if (error) throw error;
    } else if (it.kind === "match_result") {
      const { approvePendingResult } = await import("@/lib/pending-results");
      await approvePendingResult({
        pendingId: it.id,
        matchId: it.matchId!,
        seasonId: it.seasonId!,
        sets: it.sets || [],
      });
    }
  };

  const rejectOne = async (it: PendingItem) => {
    if (!user) return;
    if (it.kind === "join_request") {
      await rejectJoinRequest(it.id, user.id);
    } else if (it.kind === "claim") {
      const { error } = await supabase
        .from("player_claims")
        .update({
          status: "rejected",
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq("id", it.id);
      if (error) throw error;
    }
  };

  const handleSingle = async (it: PendingItem, action: "approve" | "reject") => {
    setBusy(true);
    try {
      if (action === "approve") await approveOne(it);
      else await rejectOne(it);
      toast.success(action === "approve" ? "Aprovado" : "Recusado");
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(it.id);
        return n;
      });
      void refreshCount();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao processar solicitação");
    } finally {
      setBusy(false);
    }
  };

  const handleBulk = async (action: "approve" | "reject") => {
    if (!selected.size) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    const targets = items.filter((i) => selected.has(i.id));
    for (const it of targets) {
      try {
        if (action === "approve") await approveOne(it);
        else await rejectOne(it);
        ok++;
      } catch (err) {
        console.error("bulk item failed:", err);
        fail++;
      }
    }
    setItems((prev) => prev.filter((x) => !selected.has(x.id)));
    setSelected(new Set());
    void refreshCount();
    setBusy(false);
    toast.success(
      `${ok} ${action === "approve" ? "aprovadas" : "recusadas"}` +
        (fail ? ` · ${fail} com erro` : ""),
    );
  };

  const triggerReminderNow = async () => {
    setReminderBusy(true);
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const res = await fetch("/hooks/admin-pending-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
          "X-Force-Send": "1",
        },
        body: JSON.stringify({ force: true, triggeredBy: user?.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      toast.success(
        `Lembrete disparado · ${json.sent ?? 0} push(es) enviados, ${
          json.processed ?? 0
        } admin(s) processados`,
      );
    } catch (err) {
      console.error(err);
      toast.error("Falha ao disparar lembrete");
    } finally {
      setReminderBusy(false);
    }
  };

  const handleUndo = async (r: ResolvedItem) => {
    if (r.kind === "claim" && r.status === "approved") {
      toast.error(
        "Vínculos aprovados são irreversíveis (dados já foram mesclados).",
      );
      return;
    }
    const ageMs = Date.now() - new Date(r.resolvedAt).getTime();
    if (ageMs > UNDO_WINDOW_MS) {
      toast.error("Janela de 24h para desfazer expirou.");
      return;
    }
    const label =
      r.status === "approved" ? "aprovação" : "recusa";
    if (!window.confirm(`Desfazer ${label} de ${r.requesterName}?`)) return;
    setUndoBusy(r.id);
    try {
      const res = await fetch("/hooks/admin-undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind: r.kind, id: r.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      toast.success("Ação desfeita · solicitação voltou para Pendentes");
      setResolved((prev) => prev.filter((x) => x.id !== r.id));
      void refreshCount();
      void loadAll();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao desfazer");
    } finally {
      setUndoBusy(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-32 lg:pb-12">
        <TrophyLoadingBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32 lg:pb-12">
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link
            to="/notifications"
            className="rounded-full border border-border bg-card p-2 text-muted-foreground hover:text-foreground"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-warning" />
            <h1 className="font-display text-xl font-bold text-foreground">
              Caixa do admin
            </h1>
            {items.length > 0 && (
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-bold text-warning">
                {items.length}
              </span>
            )}
            {criticalCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-[11px] font-bold text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {criticalCount} crítico{criticalCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button
            onClick={triggerReminderNow}
            disabled={reminderBusy || !adminGroupIds.length}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40"
            title="Forçar reenvio do push de lembrete (ignora cooldown de 24h)"
          >
            {reminderBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Bell className="h-3.5 w-3.5" />
            )}
            Disparar lembrete
          </button>
          <Link
            to="/admin/metrics"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            title="Ver métricas dos últimos 30 dias"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Métricas
          </Link>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "history")}>
          <TabsList className="mb-4">
            <TabsTrigger value="pending" className="gap-1.5">
              <Inbox className="h-3.5 w-3.5" /> Pendentes
              {items.length > 0 && (
                <span className="ml-1 rounded-full bg-warning/20 px-1.5 text-[10px] font-bold text-warning">
                  {items.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-3.5 w-3.5" /> Histórico (30d)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {items.length === 0 ? (
              <div className="rounded-3xl border border-border bg-card p-10 text-center">
                <CheckCheck className="mx-auto mb-3 h-10 w-10 text-success" />
                <p className="font-display text-base font-bold text-foreground">
                  Tudo em dia!
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nenhuma solicitação pendente nos seus grupos.
                </p>
              </div>
            ) : (
              <>
                {/* Filters */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Filter className="h-3.5 w-3.5" />
                    <span>Filtros:</span>
                  </div>
                  <select
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs"
                  >
                    <option value="all">Todos os grupos</option>
                    {groupsForFilter.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={kindFilter}
                    onChange={(e) =>
                      setKindFilter(e.target.value as "all" | Kind)
                    }
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs"
                  >
                    <option value="all">Todos os tipos</option>
                    <option value="join_request">Entrar no grupo</option>
                    <option value="claim">Vincular jogador</option>
                    <option value="match_result">Aprovar placar</option>
                  </select>
                  <select
                    value={ageFilter}
                    onChange={(e) =>
                      setAgeFilter(e.target.value as "all" | "old" | "critical")
                    }
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs"
                  >
                    <option value="all">Qualquer idade</option>
                    <option value="old">
                      Antigos (3+ dias){oldCount > 0 ? ` · ${oldCount}` : ""}
                    </option>
                    <option value="critical">
                      Críticos (7+ dias)
                      {criticalCount > 0 ? ` · ${criticalCount}` : ""}
                    </option>
                  </select>
                </div>

                {/* Bulk bar */}
                <div className="mb-3 flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2">
                  <label className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={
                        filtered.length > 0 && selected.size === filtered.length
                      }
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-border"
                    />
                    <span>
                      {selected.size > 0
                        ? `${selected.size} selecionada${selected.size > 1 ? "s" : ""}`
                        : "Selecionar tudo"}
                    </span>
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleBulk("approve")}
                      disabled={!selected.size || busy}
                      className="inline-flex items-center gap-1 rounded-full bg-success/15 px-3 py-1.5 text-xs font-semibold text-success disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </button>
                    <button
                      onClick={() => handleBulk("reject")}
                      disabled={!selected.size || busy}
                      className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" /> Recusar
                    </button>
                  </div>
                </div>

                {/* List */}
                <div className="space-y-2">
                  {filtered.map((it) => {
                    const isMatchResult = it.kind === "match_result";
                    const Icon = isMatchResult ? Trophy : it.kind === "join_request" ? UserPlus : Link2;
                    const isSelected = selected.has(it.id);
                    const lvl = ageLevel(it.createdAt);
                    const isCritical = lvl === "critical";
                    const isOldOnly = lvl === "old";
                    return (
                      <div
                        key={`${it.kind}-${it.id}`}
                        className={`rounded-2xl border p-3 transition-colors ${
                          isCritical
                            ? "border-destructive bg-destructive/15 shadow-[0_0_0_1px_hsl(var(--destructive)/0.4)]"
                            : isOldOnly
                              ? "border-destructive/50 bg-destructive/5"
                              : isSelected
                                ? "border-primary/60 bg-card"
                                : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(it.id)}
                            className="mt-1 h-4 w-4 rounded border-border"
                          />
                          <PlayerAvatar
                            avatarUrl={it.requesterAvatarUrl}
                            name={it.requesterName}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold text-foreground">
                                {it.requesterName}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  isMatchResult
                                    ? "bg-warning/15 text-warning"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                <Icon className="h-3 w-3" />
                                {isMatchResult
                                  ? "Placar"
                                  : it.kind === "join_request"
                                    ? "Entrar"
                                    : "Vincular"}
                              </span>
                              {isCritical && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
                                  <AlertTriangle className="h-3 w-3" />
                                  CRÍTICO
                                </span>
                              )}
                              <span
                                className={`text-[10px] ${
                                  isCritical
                                    ? "font-bold text-destructive"
                                    : isOldOnly
                                      ? "font-bold text-destructive/80"
                                      : "text-muted-foreground"
                                }`}
                              >
                                · {timeAgo(it.createdAt)}
                                {isCritical
                                  ? " · 7+ dias parado"
                                  : isOldOnly
                                    ? " · antigo"
                                    : ""}
                              </span>
                            </div>
                            {isMatchResult ? (
                              <>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  enviou placar para{" "}
                                  <strong className="text-foreground">
                                    {it.roundNumber ? `Rodada ${it.roundNumber}` : "rodada"}
                                    {it.matchNumber ? ` · Partida ${it.matchNumber}` : ""}
                                  </strong>{" "}
                                  em{" "}
                                  <Link
                                    to="/groups/$groupId"
                                    params={{ groupId: it.groupId }}
                                    className="font-medium text-primary hover:underline"
                                  >
                                    {it.groupName}
                                  </Link>
                                </p>
                                {it.sets && it.sets.length > 0 && (
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                    {[...it.sets]
                                      .sort((a, b) => a.setNumber - b.setNumber)
                                      .map((s) => (
                                        <span
                                          key={s.setNumber}
                                          className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px] font-bold tabular-nums text-foreground"
                                          title={`Set ${s.setNumber}`}
                                        >
                                          <span className="text-[9px] font-semibold uppercase text-muted-foreground">
                                            S{s.setNumber}
                                          </span>
                                          {s.scoreA}–{s.scoreB}
                                        </span>
                                      ))}
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {it.kind === "claim" && it.targetPlayerName ? (
                                  <>
                                    quer vincular a{" "}
                                    <strong className="text-foreground">
                                      {it.targetPlayerName}
                                    </strong>{" "}
                                    em{" "}
                                  </>
                                ) : it.kind === "join_request" &&
                                  it.targetPlayerName ? (
                                  <>
                                    quer entrar como{" "}
                                    <strong className="text-foreground">
                                      {it.targetPlayerName}
                                    </strong>{" "}
                                    em{" "}
                                  </>
                                ) : (
                                  <>quer entrar em </>
                                )}
                                <Link
                                  to="/groups/$groupId"
                                  params={{ groupId: it.groupId }}
                                  className="font-medium text-primary hover:underline"
                                >
                                  {it.groupName}
                                </Link>
                              </p>
                            )}
                            {it.message && (
                              <p className="mt-1 rounded-lg bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
                                "{it.message}"
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => handleSingle(it, "approve")}
                              disabled={busy}
                              className="rounded-lg bg-success/15 p-2 text-success disabled:opacity-40"
                              aria-label="Aprovar"
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => handleSingle(it, "reject")}
                              disabled={busy}
                              className="rounded-lg bg-destructive/15 p-2 text-destructive disabled:opacity-40"
                              aria-label="Recusar"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="history">
            {loadingResolved ? (
              <div className="rounded-3xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Carregando histórico…
              </div>
            ) : resolved.length === 0 ? (
              <div className="rounded-3xl border border-border bg-card p-10 text-center">
                <History className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-display text-base font-bold text-foreground">
                  Sem ações nos últimos 30 dias
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Aprovações e recusas dos últimos 30 dias aparecem aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {resolved.map((r) => {
                  const Icon = r.kind === "join_request" ? UserPlus : Link2;
                  const approved = r.status === "approved";
                  const ageMs = Date.now() - new Date(r.resolvedAt).getTime();
                  const undoable =
                    ageMs <= UNDO_WINDOW_MS &&
                    !(r.kind === "claim" && approved);
                  const undoTitle =
                    r.kind === "claim" && approved
                      ? "Vínculos aprovados são irreversíveis"
                      : ageMs > UNDO_WINDOW_MS
                        ? "Janela de 24h expirou"
                        : "Desfazer (até 24h)";
                  return (
                    <div
                      key={`${r.kind}-${r.id}`}
                      className="rounded-2xl border border-border bg-card p-3"
                    >
                      <div className="flex items-start gap-3">
                        <PlayerAvatar
                          avatarUrl={r.requesterAvatarUrl}
                          name={r.requesterName}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold text-foreground">
                              {r.requesterName}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              <Icon className="h-3 w-3" />
                              {r.kind === "join_request" ? "Entrar" : "Vincular"}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                approved
                                  ? "bg-success/15 text-success"
                                  : "bg-destructive/15 text-destructive"
                              }`}
                            >
                              {approved ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                              {approved ? "Aprovado" : "Recusado"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              · {timeAgo(r.resolvedAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {r.kind === "claim" && r.targetPlayerName ? (
                              <>
                                vínculo com{" "}
                                <strong className="text-foreground">
                                  {r.targetPlayerName}
                                </strong>{" "}
                                em{" "}
                              </>
                            ) : r.kind === "join_request" &&
                              r.targetPlayerName ? (
                              <>
                                entrada como{" "}
                                <strong className="text-foreground">
                                  {r.targetPlayerName}
                                </strong>{" "}
                                em{" "}
                              </>
                            ) : (
                              <>entrada em </>
                            )}
                            <Link
                              to="/groups/$groupId"
                              params={{ groupId: r.groupId }}
                              className="font-medium text-primary hover:underline"
                            >
                              {r.groupName}
                            </Link>
                            {r.resolvedByName && (
                              <>
                                {" "}
                                ·{" "}
                                <span className="text-foreground">
                                  por {r.resolvedByName}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                        {undoable && (
                          <button
                            onClick={() => handleUndo(r)}
                            disabled={undoBusy === r.id}
                            title={undoTitle}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted disabled:opacity-40"
                          >
                            {undoBusy === r.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Undo2 className="h-3.5 w-3.5" />
                            )}
                            Desfazer
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
