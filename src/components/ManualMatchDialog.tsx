import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Plus, UserPlus, Swords, Save } from "lucide-react";
import { toast } from "sonner";

interface GroupMember {
  user_id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
}

interface MatchDraft {
  teamA: string[];
  teamB: string[];
}

interface Props {
  roundId: string;
  groupId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ManualMatchDialog({ roundId, groupId, onClose, onSaved }: Props) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [matches, setMatches] = useState<MatchDraft[]>([{ teamA: [], teamB: [] }]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: gm } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .eq("status", "active");

      if (gm?.length) {
        const ids = gm.map((m) => m.user_id);
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, name, nickname, avatar_url")
          .in("user_id", ids);
        setMembers(
          (profiles || []).map((p) => ({
            user_id: p.user_id,
            name: p.name || "Jogador",
            nickname: p.nickname,
            avatar_url: p.avatar_url,
          }))
        );
      }
      setLoading(false);
    };
    load();
  }, [groupId]);

  const allSelected = new Set(matches.flatMap((m) => [...m.teamA, ...m.teamB]));
  const available = members.filter((m) => !allSelected.has(m.user_id));

  const addPlayerToTeam = (matchIdx: number, team: "A" | "B", userId: string) => {
    setMatches((prev) =>
      prev.map((m, i) => {
        if (i !== matchIdx) return m;
        const arr = team === "A" ? "teamA" : "teamB";
        if (m[arr].length >= 2) return m;
        return { ...m, [arr]: [...m[arr], userId] };
      })
    );
  };

  const removePlayerFromTeam = (matchIdx: number, team: "A" | "B", userId: string) => {
    setMatches((prev) =>
      prev.map((m, i) => {
        if (i !== matchIdx) return m;
        const arr = team === "A" ? "teamA" : "teamB";
        return { ...m, [arr]: m[arr].filter((id) => id !== userId) };
      })
    );
  };

  const addMatch = () => {
    setMatches((prev) => [...prev, { teamA: [], teamB: [] }]);
  };

  const removeMatch = (idx: number) => {
    if (matches.length <= 1) return;
    setMatches((prev) => prev.filter((_, i) => i !== idx));
  };

  const getMemberName = (userId: string) => {
    const m = members.find((x) => x.user_id === userId);
    return m?.nickname || m?.name || "Jogador";
  };

  const getMemberAvatar = (userId: string) => {
    return members.find((x) => x.user_id === userId)?.avatar_url;
  };

  const isValid = matches.every((m) => m.teamA.length === 2 && m.teamB.length === 2);

  const handleSubmit = async () => {
    if (!isValid) {
      toast.error("Cada partida precisa de 2 jogadores por time");
      return;
    }
    setSubmitting(true);
    try {
      // Create presence records for all players
      const allPlayerIds = [...new Set(matches.flatMap((m) => [...m.teamA, ...m.teamB]))];
      for (const uid of allPlayerIds) {
        await supabase.from("round_presence").upsert(
          { round_id: roundId, user_id: uid, status: "confirmed", confirmed_at: new Date().toISOString() },
          { onConflict: "round_id,user_id" }
        ).then(({ error }) => {
          if (error) {
            // fallback insert
            return supabase.from("round_presence").insert({
              round_id: roundId, user_id: uid, status: "confirmed", confirmed_at: new Date().toISOString(),
            });
          }
        });
      }

      // Create matches
      for (let i = 0; i < matches.length; i++) {
        const draft = matches[i];
        const { data: match, error } = await supabase
          .from("matches")
          .insert({ round_id: roundId, match_number: i + 1, status: "scheduled" })
          .select()
          .single();
        if (error) throw error;

        const players = [
          ...draft.teamA.map((uid) => ({ match_id: match.id, user_id: uid, team: "A" })),
          ...draft.teamB.map((uid) => ({ match_id: match.id, user_id: uid, team: "B" })),
        ];
        await supabase.from("match_players").insert(players);
      }

      // Update round status
      await supabase.from("rounds").update({ status: "in_progress" }).eq("id", roundId);

      toast.success(`${matches.length} partida${matches.length > 1 ? "s" : ""} criada${matches.length > 1 ? "s" : ""}!`);
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar partidas");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-border bg-card p-6 pb-10 sm:pb-6 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold text-foreground">
            Criar Partidas Manualmente
          </h2>
          <button onClick={onClose} className="rounded-full bg-muted p-2">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((match, idx) => (
              <div key={idx} className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Swords className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Partida {idx + 1}</span>
                  </div>
                  {matches.length > 1 && (
                    <button onClick={() => removeMatch(idx)} className="text-xs text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Team A */}
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      Time A ({match.teamA.length}/2)
                    </p>
                    <div className="space-y-1.5">
                      {match.teamA.map((uid) => (
                        <div key={uid} className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1">
                          {getMemberAvatar(uid) ? (
                            <img src={getMemberAvatar(uid)!} alt="" className="h-5 w-5 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                              {getMemberName(uid).charAt(0)}
                            </div>
                          )}
                          <span className="flex-1 text-xs text-foreground truncate">{getMemberName(uid)}</span>
                          <button onClick={() => removePlayerFromTeam(idx, "A", uid)}>
                            <X className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
                      ))}
                      {match.teamA.length < 2 && (
                        <PlayerSelector
                          available={available}
                          onSelect={(uid) => addPlayerToTeam(idx, "A", uid)}
                        />
                      )}
                    </div>
                  </div>

                  {/* Team B */}
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-info">
                      Time B ({match.teamB.length}/2)
                    </p>
                    <div className="space-y-1.5">
                      {match.teamB.map((uid) => (
                        <div key={uid} className="flex items-center gap-1.5 rounded-full bg-info/10 px-2 py-1">
                          {getMemberAvatar(uid) ? (
                            <img src={getMemberAvatar(uid)!} alt="" className="h-5 w-5 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                              {getMemberName(uid).charAt(0)}
                            </div>
                          )}
                          <span className="flex-1 text-xs text-foreground truncate">{getMemberName(uid)}</span>
                          <button onClick={() => removePlayerFromTeam(idx, "B", uid)}>
                            <X className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
                      ))}
                      {match.teamB.length < 2 && (
                        <PlayerSelector
                          available={available}
                          onSelect={(uid) => addPlayerToTeam(idx, "B", uid)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {available.length >= 4 && (
              <button
                onClick={addMatch}
                className="w-full rounded-2xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground"
              >
                <Plus className="mr-1 inline h-3.5 w-3.5" />
                Adicionar Partida
              </button>
            )}

            <button
              onClick={handleSubmit}
              disabled={!isValid || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {submitting ? "Criando..." : `Criar ${matches.length} Partida${matches.length > 1 ? "s" : ""}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerSelector({
  available,
  onSelect,
}: {
  available: GroupMember[];
  onSelect: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1 rounded-full border border-dashed border-border py-1.5 text-[10px] text-muted-foreground"
      >
        <UserPlus className="h-3 w-3" />
        Adicionar
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-2 max-h-32 overflow-y-auto space-y-1">
      {available.length === 0 ? (
        <p className="text-[10px] text-muted-foreground text-center py-1">Nenhum jogador disponível</p>
      ) : (
        available.map((m) => (
          <button
            key={m.user_id}
            onClick={() => {
              onSelect(m.user_id);
              setOpen(false);
            }}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left hover:bg-muted/50"
          >
            {m.avatar_url ? (
              <img src={m.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                {(m.nickname || m.name).charAt(0)}
              </div>
            )}
            <span className="text-xs text-foreground">{m.nickname || m.name}</span>
          </button>
        ))
      )}
      <button
        onClick={() => setOpen(false)}
        className="w-full text-[10px] text-muted-foreground pt-1"
      >
        Cancelar
      </button>
    </div>
  );
}
