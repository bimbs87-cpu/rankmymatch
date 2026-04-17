import { useEffect, useState } from "react";
import { UserPlus, X, Loader2, UserMinus, Ghost, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { toast } from "sonner";

interface ClaimablePlayer {
  user_id: string;
  name: string;
  avatar_url: string | null;
  kind: "placeholder" | "former";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  isPublicGroup: boolean;
  userId: string;
  onJoined: () => void;
}

/**
 * Dialog shown when a user clicks "Entrar" / "Solicitar entrada".
 * Lets them optionally identify themselves as an existing placeholder OR ex-member,
 * so the admin can approve and merge the historical data.
 *
 * - Public group + no claim → joins directly as a new member.
 * - Public group + claim → creates a join request (admin must approve to merge).
 * - Private group → always creates a join request.
 */
export function JoinGroupDialog({
  open,
  onOpenChange,
  groupId,
  isPublicGroup,
  userId,
  onJoined,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [placeholders, setPlaceholders] = useState<ClaimablePlayer[]>([]);
  const [formers, setFormers] = useState<ClaimablePlayer[]>([]);
  const [selected, setSelected] = useState<ClaimablePlayer | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setMessage("");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: members } = await supabase
          .from("group_members")
          .select("user_id, status")
          .eq("group_id", groupId);

        if (!members?.length) {
          if (!cancelled) {
            setPlaceholders([]);
            setFormers([]);
          }
          return;
        }

        const activeIds = members.filter((m) => m.status === "active").map((m) => m.user_id);
        const formerIds = members
          .filter((m) => m.status === "removed" || m.status === "left")
          .map((m) => m.user_id)
          .filter((id) => id !== userId);

        const allIds = [...activeIds, ...formerIds];
        if (!allIds.length) {
          if (!cancelled) {
            setPlaceholders([]);
            setFormers([]);
          }
          return;
        }

        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, name, avatar_url, is_placeholder")
          .in("user_id", allIds);

        if (cancelled) return;

        const phs: ClaimablePlayer[] = (profiles || [])
          .filter((p) => p.is_placeholder && activeIds.includes(p.user_id))
          .map((p) => ({ user_id: p.user_id, name: p.name, avatar_url: p.avatar_url, kind: "placeholder" }));

        const fms: ClaimablePlayer[] = (profiles || [])
          .filter((p) => !p.is_placeholder && formerIds.includes(p.user_id))
          .map((p) => ({ user_id: p.user_id, name: p.name, avatar_url: p.avatar_url, kind: "former" }));

        setPlaceholders(phs);
        setFormers(fms);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, groupId, userId]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Public group + no claim: direct join
      if (isPublicGroup && !selected) {
        const { error } = await supabase.from("group_members").insert({
          group_id: groupId,
          user_id: userId,
          role: "member",
          status: "active",
        });
        if (error) {
          if (error.message?.includes("duplicate")) {
            toast.error("Você já é membro ou já solicitou.");
          } else {
            throw error;
          }
          return;
        }
        toast.success("Você entrou no grupo!");
        onJoined();
        onOpenChange(false);
        return;
      }

      // Otherwise: create a join request (with optional claim)
      const insertData: any = {
        group_id: groupId,
        user_id: userId,
        status: "pending",
        message: message.trim() || (selected ? `Eu sou ${selected.name}` : ""),
      };
      if (selected) {
        insertData.claimed_player_id = selected.user_id;
        insertData.claimed_player_kind = selected.kind;
      }

      const { error } = await supabase.from("group_join_requests").insert(insertData);
      if (error) {
        if (error.message?.includes("duplicate")) {
          toast.error("Você já é membro ou já solicitou.");
        } else {
          throw error;
        }
        return;
      }
      toast.success(
        selected
          ? "Solicitação enviada! O admin vai aprovar e vincular seu histórico."
          : "Solicitação enviada!",
      );
      onJoined();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao enviar solicitação");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const hasClaimables = placeholders.length > 0 || formers.length > 0;

  const renderRow = (p: ClaimablePlayer) => {
    const isSelected = selected?.user_id === p.user_id;
    return (
      <button
        key={p.user_id}
        type="button"
        onClick={() => setSelected(isSelected ? null : p)}
        className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition-colors ${
          isSelected ? "border-primary bg-primary/10" : "border-border bg-muted/20"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <PlayerAvatar
            avatarUrl={p.avatar_url}
            name={p.name}
            size="md"
            dimmed={p.kind === "former"}
            className="border border-border"
          />
          <div className="min-w-0">
            <p className={`text-sm font-medium truncate ${p.kind === "former" ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {p.name}
            </p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              {p.kind === "placeholder" ? (
                <>
                  <Ghost className="h-2.5 w-2.5" /> Sem conta
                </>
              ) : (
                <>
                  <UserMinus className="h-2.5 w-2.5" /> Ex-membro
                </>
              )}
            </p>
          </div>
        </div>
        {isSelected && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            Selecionado
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-[92%] max-w-sm rounded-3xl border border-border bg-card p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-2 mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <UserPlus className="h-7 w-7 text-primary" />
          </div>
          <h3 className="font-display text-base font-bold text-foreground">
            {isPublicGroup ? "Entrar no grupo" : "Solicitar entrada"}
          </h3>
          <p className="text-center text-xs text-muted-foreground">
            {hasClaimables
              ? "Você já joga aqui? Selecione seu nome para vincular o histórico ao aprovar."
              : isPublicGroup
                ? "Confirme para entrar como novo membro."
                : "Envie uma solicitação ao admin para entrar."}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {placeholders.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Link2 className="h-3 w-3 text-primary" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Sou um destes jogadores
                    </span>
                  </div>
                  {placeholders.map(renderRow)}
                </div>
              )}

              {formers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 pt-2">
                    <UserMinus className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Ex-membros
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Estes jogadores saíram do grupo. Selecione apenas se este nome for você.
                  </p>
                  {formers.map(renderRow)}
                </div>
              )}

              {!isPublicGroup && (
                <div className="pt-1">
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    Mensagem para o admin (opcional)
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={2}
                    maxLength={200}
                    placeholder="Ex: Sou amigo do João..."
                    className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || loading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {selected
            ? "Pedir vinculação"
            : isPublicGroup
              ? "Entrar como novo membro"
              : "Enviar solicitação"}
        </button>
      </div>
    </div>
  );
}
