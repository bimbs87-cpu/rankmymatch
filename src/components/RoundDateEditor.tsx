import { useEffect, useId, useState } from "react";
import { Calendar, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { canChangeRoundDate, roundDateUpdate } from "@/lib/round-date";
import { invalidateSharedFetch } from "@/lib/shared-fetch";

interface Props {
  roundId: string;
  groupId: string;
  scheduledDate: string | null;
  status: string | null;
  onSaved: (date: string) => void;
}

export function RoundDateEditor({ roundId, groupId, scheduledDate, status, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(scheduledDate ?? "");
  const [saving, setSaving] = useState(false);
  const inputId = useId();
  useEffect(() => {
    setEditing(false);
    setDate(scheduledDate ?? "");
  }, [roundId, scheduledDate]);

  if (!canChangeRoundDate(status)) return null;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const update = roundDateUpdate(date);
      const { data, error } = await supabase.from("rounds")
        .update(update).eq("id", roundId).eq("group_id", groupId)
        .in("status", ["scheduled", "in_progress"])
        .select("id, scheduled_date").single();
      if (error || !data) throw new Error("Não foi possível alterar a data. Verifique sua permissão e se a rodada ainda está aberta.");
      invalidateSharedFetch("home-group-stats:");
      invalidateSharedFetch("group-stats:");
      invalidateSharedFetch("all-groups-pending:");
      invalidateSharedFetch("admin-pending:");
      setEditing(false);
      onSaved(date);
      toast.success("Data da rodada atualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar data");
    } finally {
      setSaving(false);
    }
  };

  return editing ? (
    <form className="w-full min-w-0 space-y-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label htmlFor={inputId} className="block text-xs font-semibold text-foreground">Nova data da rodada</label>
      <input id={inputId} type="date" required value={date} disabled={saving}
        onChange={(event) => setDate(event.target.value)}
        className="block h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" />
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" disabled={saving || !date || date === scheduledDate} className="min-h-11 gap-1.5 rounded-xl">
          <Check className="h-4 w-4" />{saving ? "Salvando…" : "Salvar data"}
        </Button>
        <Button type="button" variant="outline" disabled={saving} className="min-h-11 gap-1.5 rounded-xl"
          onClick={() => { setDate(scheduledDate ?? ""); setEditing(false); }}>
          <X className="h-4 w-4" />Cancelar
        </Button>
      </div>
    </form>
  ) : (
    <Button type="button" variant="outline" className="min-h-11 gap-2 rounded-xl" onClick={() => setEditing(true)}>
      <Calendar className="h-4 w-4" />Alterar data
    </Button>
  );
}