import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { ArrowRight, GitMerge, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

interface MemberLite {
  id: string;
  user_id: string;
  status: string;
  profile?: { name: string; nickname?: string | null; avatar_url?: string | null } | null;
}

interface MergeMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  formerMember: MemberLite | null;
  activeMembers: MemberLite[];
  onMerged: () => void;
}

/**
 * Admin-only dialog: merge a former member's history into an active member
 * who has NO match results yet in this group.
 */
export function MergeMembersDialog({
  open,
  onOpenChange,
  groupId,
  formerMember,
  activeMembers,
  onMerged,
}: MergeMembersDialogProps) {
  const [eligibleIds, setEligibleIds] = useState<Set<string> | null>(null);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedUserId(null);
    }
  }, [open]);

  // Load which active members have NO match results in this group
  useEffect(() => {
    if (!open || !activeMembers.length) {
      setEligibleIds(null);
      return;
    }
    setLoadingEligible(true);
    (async () => {
      const userIds = activeMembers.map((m) => m.user_id);
      // Get all user_ids that DO have results in this group
      const { data, error } = await supabase
        .from("match_players")
        .select("user_id, matches!inner(round_id, rounds!inner(group_id))")
        .in("user_id", userIds)
        .eq("matches.rounds.group_id", groupId);
      if (error) {
        console.error(error);
        setEligibleIds(new Set(userIds));
      } else {
        const withResults = new Set((data || []).map((r: any) => r.user_id));
        setEligibleIds(new Set(userIds.filter((id) => !withResults.has(id))));
      }
      setLoadingEligible(false);
    })();
  }, [open, activeMembers, groupId]);

  const eligibleMembers = useMemo(() => {
    if (!eligibleIds) return [] as MemberLite[];
    return activeMembers.filter(
      (m) =>
        eligibleIds.has(m.user_id) &&
        m.user_id !== formerMember?.user_id &&
        (!search.trim() ||
          (m.profile?.name || "").toLowerCase().includes(search.trim().toLowerCase()) ||
          (m.profile?.nickname || "").toLowerCase().includes(search.trim().toLowerCase())),
    );
  }, [activeMembers, eligibleIds, formerMember, search]);

  const selected = eligibleMembers.find((m) => m.user_id === selectedUserId) || null;

  if (!open || !formerMember) return null;

  const handleMerge = async () => {
    if (!selectedUserId) return;
    setMerging(true);
    try {
      const { error } = await supabase.rpc("merge_former_member_into_active" as any, {
        _group_id: groupId,
        _former_user_id: formerMember.user_id,
        _target_user_id: selectedUserId,
      });
      if (error) throw error;
      toast.success("Membros mesclados com sucesso");
      onMerged();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao mesclar membros");
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !merging && onOpenChange(false)}
      />
      <div className="relative w-full max-w-md rounded-t-3xl border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom)+6rem)] sm:rounded-3xl sm:pb-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10">
              <GitMerge className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-foreground">Mesclar membros</h3>
              <p className="text-[11px] text-muted-foreground">Transferir histórico do ex-membro</p>
            </div>
          </div>
          <button
            onClick={() => !merging && onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preview: source -> target */}
        <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-border bg-background p-3">
          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <PlayerAvatar
              avatarUrl={null}
              name={formerMember.profile?.name || "?"}
              size="md"
              dimmed
            />
            <span className="text-[11px] font-medium text-muted-foreground line-through truncate max-w-full">
              {formerMember.profile?.name || "Ex-membro"}
            </span>
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70">Origem</span>
          </div>
          <ArrowRight className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
            {selected ? (
              <>
                <PlayerAvatar
                  avatarUrl={selected.profile?.avatar_url}
                  name={selected.profile?.name || "?"}
                  size="md"
                />
                <span className="text-[11px] font-bold text-foreground truncate max-w-full">
                  {selected.profile?.nickname || selected.profile?.name}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-primary">Destino</span>
              </>
            ) : (
              <>
                <div className="h-10 w-10 rounded-full border border-dashed border-border" />
                <span className="text-[11px] text-muted-foreground">Selecione abaixo</span>
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70">Destino</span>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar membro ativo sem jogos..."
            className="w-full rounded-2xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Eligible list */}
        <div className="mb-4 max-h-64 overflow-y-auto rounded-2xl border border-border bg-background">
          {loadingEligible ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : eligibleMembers.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              Nenhum membro ativo elegível.<br />
              Apenas membros sem jogos registrados podem receber o histórico.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {eligibleMembers.map((m) => {
                const isSelected = selectedUserId === m.user_id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedUserId(m.user_id)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      isSelected ? "bg-primary/10" : "active:bg-accent/30"
                    }`}
                  >
                    <PlayerAvatar
                      avatarUrl={m.profile?.avatar_url}
                      name={m.profile?.name || "?"}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {m.profile?.nickname || m.profile?.name || "Jogador"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Sem jogos</p>
                    </div>
                    {isSelected && (
                      <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-warning/30 bg-warning/5 p-2.5 mb-4">
          <p className="text-[11px] text-foreground/90 leading-snug">
            Todos os jogos, presenças, ranking e estatísticas de{" "}
            <strong>{formerMember.profile?.name || "ex-membro"}</strong> serão transferidos para o membro selecionado.
            Esta ação é <strong>irreversível</strong>.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onOpenChange(false)}
            disabled={merging}
            className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-foreground disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleMerge}
            disabled={!selectedUserId || merging}
            className="flex-1 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {merging && <Loader2 className="h-4 w-4 animate-spin" />}
            Mesclar
          </button>
        </div>
      </div>
    </div>
  );
}
