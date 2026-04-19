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
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAdminPendingCount } from "@/hooks/use-admin-pending-count";
import { approveJoinRequest, rejectJoinRequest } from "@/hooks/use-groups";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
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

type Kind = "join_request" | "claim";

interface PendingItem {
  id: string;
  kind: Kind;
  groupId: string;
  groupName: string;
  requesterUserId: string;
  requesterName: string;
  requesterAvatarUrl: string | null;
  // join_request: claimed player (optional). claim: placeholder being merged.
  targetPlayerId: string | null;
  targetPlayerName: string | null;
  message: string | null;
  createdAt: string;
}

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

function AdminInboxPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { adminGroupIds, refresh: refreshCount } = useAdminPendingCount();

  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

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
      const [reqsRes, claimsRes, groupsRes] = await Promise.all([
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
      }
      for (const c of claims) {
        userIds.add(c.claimer_user_id);
        userIds.add(c.placeholder_user_id);
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
      ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

      setItems(merged);
    } catch (err) {
      console.error("Erro ao carregar caixa do admin:", err);
      toast.error("Erro ao carregar solicitações");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, adminGroupIds.join(",")]);

  const groupsForFilter = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) m.set(it.groupId, it.groupName);
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter(
      (it) =>
        (groupFilter === "all" || it.groupId === groupFilter) &&
        (kindFilter === "all" || it.kind === kindFilter),
    );
  }, [items, groupFilter, kindFilter]);

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
    } else {
      const { error } = await supabase.rpc("merge_placeholder_player", {
        _placeholder_user_id: it.targetPlayerId!,
        _real_user_id: it.requesterUserId,
        _group_id: it.groupId,
      });
      if (error) throw error;
    }
  };

  const rejectOne = async (it: PendingItem) => {
    if (!user) return;
    if (it.kind === "join_request") {
      await rejectJoinRequest(it.id, user.id);
    } else {
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
        <div className="mb-4 flex items-center gap-3">
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
          </div>
        </div>

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
                const Icon = it.kind === "join_request" ? UserPlus : Link2;
                const isSelected = selected.has(it.id);
                return (
                  <div
                    key={`${it.kind}-${it.id}`}
                    className={`rounded-2xl border bg-card p-3 transition-colors ${isSelected ? "border-primary/60" : "border-border"}`}
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
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            <Icon className="h-3 w-3" />
                            {it.kind === "join_request"
                              ? "Entrar"
                              : "Vincular"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            · {timeAgo(it.createdAt)}
                          </span>
                        </div>
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
      </div>
    </div>
  );
}
