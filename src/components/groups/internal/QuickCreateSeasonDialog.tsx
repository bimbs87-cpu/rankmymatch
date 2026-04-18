import { useState } from "react";
import { X, Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { createSeason } from "@/lib/season-actions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  groupId: string;
  defaultMatchFormat?: string; // group's match_format: doubles | singles
  onClose: () => void;
  onCreated: () => void;
}

export function QuickCreateSeasonDialog({ groupId, defaultMatchFormat, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [totalRounds, setTotalRounds] = useState<number>(8);
  const [matchFormat, setMatchFormat] = useState<string>(
    defaultMatchFormat === "singles" ? "singles" : "doubles"
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Dê um nome para a temporada");
      return;
    }
    if (totalRounds < 1 || totalRounds > 100) {
      toast.error("Total de rodadas inválido");
      return;
    }
    setSaving(true);
    try {
      const season = await createSeason({
        groupId,
        name: trimmed,
        userId: user.id,
        matchFormat,
        totalRounds,
      });
      // Notify members (best-effort, non-blocking)
      try {
        await supabase.from("notifications").insert({
          user_id: user.id,
          group_id: groupId,
          type: "season_created",
          title: "Nova temporada! 🏆",
          body: `${trimmed} foi criada com ${totalRounds} rodada${totalRounds === 1 ? "" : "s"}.`,
          data: { seasonId: season.id },
        });
      } catch {
        /* ignore */
      }
      toast.success("Temporada criada!");
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar temporada");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Trophy className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-foreground">Nova temporada</h3>
              <p className="text-[11px] text-muted-foreground">
                Configurações avançadas podem ser ajustadas depois
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Nome da temporada *
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Ex.: Temporada Verão 2026"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) submit();
              }}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Total de rodadas
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={totalRounds}
              onChange={(e) => setTotalRounds(Number(e.target.value) || 0)}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Você poderá criar/cancelar rodadas individuais depois.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">Formato</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: "doubles", label: "Duplas (2v2)" },
                { v: "singles", label: "Singles (1v1)" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setMatchFormat(opt.v)}
                  className={`rounded-2xl border p-3 text-xs font-bold transition-colors ${
                    matchFormat === opt.v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Criando..." : "Criar temporada"}
          </button>
        </div>
      </div>
    </div>
  );
}
