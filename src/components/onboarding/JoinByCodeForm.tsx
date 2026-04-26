import { useState } from "react";
import { Loader2, Search, Users, Lock, Globe, EyeOff, ArrowLeft, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

interface FoundGroup {
  id: string;
  name: string;
  visibility: string;
  match_format: string;
  singles_group_type: string | null;
  sport: string;
  member_count: number;
  requires_approval: boolean;
  image_url: string | null;
  description: string | null;
}

interface Props {
  onBack: () => void;
  onJoined: () => void;
}

/**
 * Form to find a group by its public code (RMM-XXXXXX) and request to join.
 * Works for hidden groups too — that's the whole point of the public code.
 */
export function JoinByCodeForm({ onBack, onJoined }: Props) {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<FoundGroup | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const normalized = code.trim().toUpperCase();
  const looksLikeCode = /^RMM-[A-Z0-9]{6}$/.test(normalized);

  const handleSearch = async () => {
    if (!looksLikeCode) {
      toast.error("Código inválido. Formato: RMM-XXXXXX");
      return;
    }
    setSearching(true);
    setNotFound(false);
    setFound(null);
    try {
      const { data, error } = await supabase.rpc("find_group_by_public_code", { _code: normalized });
      if (error) throw error;
      const row = (data && data[0]) || null;
      if (!row) {
        setNotFound(true);
      } else {
        setFound(row as FoundGroup);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao buscar grupo");
    } finally {
      setSearching(false);
    }
  };

  const handleJoinRequest = async () => {
    if (!user || !found) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("group_join_requests").insert({
        group_id: found.id,
        user_id: user.id,
        status: "pending",
        message: message.trim() || null,
      });
      if (error) {
        if (error.message?.includes("duplicate")) {
          toast.error("Você já solicitou entrada neste grupo.");
        } else {
          throw error;
        }
        return;
      }
      void import("@/lib/onboarding-events").then(({ trackOnboardingStep }) =>
        trackOnboardingStep("joined_first_group", { group_id: found.id, via: "public_code" }),
      );
      toast.success("Solicitação enviada! Aguarde a aprovação do admin.");
      onJoined();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao enviar solicitação");
    } finally {
      setSubmitting(false);
    }
  };

  const visIcon =
    found?.visibility === "public" ? Globe : found?.visibility === "hidden" ? EyeOff : Lock;
  const VisIcon = visIcon;
  const visLabel =
    found?.visibility === "public"
      ? "Público"
      : found?.visibility === "hidden"
        ? "Oculto (acesso só por código)"
        : "Privado";

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </button>

      <div>
        <h2 className="font-display text-xl font-bold text-foreground">Tenho um código</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cole o código que o admin te enviou. Funciona até em grupos ocultos.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-muted-foreground">
          Código do grupo
        </label>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setFound(null);
              setNotFound(false);
            }}
            placeholder="RMM-XXXXXX"
            maxLength={10}
            className="h-11 font-mono text-base tracking-wider uppercase"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !looksLikeCode}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </button>
        </div>
      </div>

      {notFound && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Nenhum grupo encontrado com esse código. Confirme com o admin.
        </div>
      )}

      {found && (
        <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card ring-1 ring-border">
              {found.image_url ? (
                <img src={found.image_url} alt={found.name} className="h-full w-full object-cover" />
              ) : (
                <Users className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display truncate text-base font-bold text-foreground">{found.name}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 font-semibold text-muted-foreground ring-1 ring-border">
                  <VisIcon className="h-2.5 w-2.5" />
                  {visLabel}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 font-semibold text-muted-foreground ring-1 ring-border">
                  <Users className="h-2.5 w-2.5" />
                  {found.member_count} membro{found.member_count !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>

          {found.description && found.visibility !== "hidden" && (
            <p className="text-xs text-muted-foreground">{found.description}</p>
          )}

          <div>
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

          <button
            onClick={handleJoinRequest}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Solicitar entrada
          </button>
        </div>
      )}
    </div>
  );
}
