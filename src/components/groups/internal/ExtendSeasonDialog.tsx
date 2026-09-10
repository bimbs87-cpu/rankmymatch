import { useEffect, useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

type Mode = "until" | "count";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseISO(s: string) {
  return new Date(s + "T00:00:00");
}

function fmt(s: string) {
  const d = parseISO(s);
  return `${WEEKDAYS[d.getDay()]} · ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
}

export function ExtendSeasonDialog({
  open, onOpenChange, season, groupId, rounds, onExtended,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  season: any;
  groupId: string;
  rounds: any[];
  onExtended: () => void;
}) {
  const sorted = useMemo(
    () => [...rounds].filter((r) => r.scheduled_date).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
    [rounds]
  );
  const lastRound = sorted[sorted.length - 1];
  const prevRound = sorted[sorted.length - 2];

  const defaultIntervalDays = useMemo(() => {
    if (!lastRound || !prevRound) return 7;
    const diff = Math.round(
      (parseISO(lastRound.scheduled_date).getTime() - parseISO(prevRound.scheduled_date).getTime()) / 86_400_000
    );
    return diff >= 1 && diff <= 60 ? diff : 7;
  }, [lastRound, prevRound]);

  const [mode, setMode] = useState<Mode>("until");
  const [untilDate, setUntilDate] = useState("");
  const [count, setCount] = useState(4);
  const [intervalDays, setIntervalDays] = useState(7);
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("until");
    setCount(4);
    setIntervalDays(defaultIntervalDays);
    const withMeta = [...sorted].reverse().find((r) => r.scheduled_time || r.location);
    setTime(withMeta?.scheduled_time ? withMeta.scheduled_time.slice(0, 5) : "");
    setLocation(withMeta?.location || "");
    const year = new Date().getFullYear();
    setUntilDate(`${year}-12-31`);
  }, [open, defaultIntervalDays, sorted]);

  const baseDate = lastRound?.scheduled_date || toISO(new Date());

  const newDates = useMemo(() => {
    const out: string[] = [];
    const start = parseISO(baseDate);
    if (mode === "count") {
      for (let i = 1; i <= Math.max(0, Math.min(count, 60)); i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + intervalDays * i);
        out.push(toISO(d));
      }
      return out;
    }
    if (!untilDate) return out;
    const limit = parseISO(untilDate);
    let i = 1;
    while (i <= 200) {
      const d = new Date(start);
      d.setDate(d.getDate() + intervalDays * i);
      if (d > limit) break;
      out.push(toISO(d));
      i++;
    }
    return out;
  }, [mode, count, intervalDays, untilDate, baseDate]);

  const nextNumber = useMemo(() => {
    const max = rounds.reduce((acc, r) => Math.max(acc, r.round_number || 0), 0);
    return max + 1;
  }, [rounds]);

  const confirm = async () => {
    if (!newDates.length) {
      toast.error("Nenhuma rodada seria criada. Ajuste a data ou a quantidade.");
      return;
    }
    setSaving(true);
    try {
      const isSingles = (season.match_format || "2v2") === "1v1";
      const maxPlayers = lastRound?.max_players ?? (isSingles ? 2 : 4);
      const roundFormat = lastRound?.match_format ?? (isSingles ? "singles" : "doubles");

      const inserts = newDates.map((date, idx) => ({
        group_id: groupId,
        season_id: season.id,
        round_number: nextNumber + idx,
        scheduled_date: date,
        scheduled_time: time ? `${time}:00` : null,
        location: location || null,
        max_players: maxPlayers,
        match_format: roundFormat,
        status: "scheduled" as const,
      }));

      const { error } = await supabase.from("rounds").insert(inserts);
      if (error) throw error;

      const totalRounds = (season.total_rounds || rounds.length) + newDates.length;
      const patch: any = {
        total_rounds: totalRounds,
        end_date: newDates[newDates.length - 1],
        updated_at: new Date().toISOString(),
      };
      if (season.status !== "active") patch.status = "active";
      const { error: sErr } = await supabase.from("seasons").update(patch).eq("id", season.id);
      if (sErr) throw sErr;

      toast.success(`Temporada estendida com ${newDates.length} rodada${newDates.length > 1 ? "s" : ""}`, {
        description: `Vai até ${fmt(newDates[newDates.length - 1])}`,
      });
      onOpenChange(false);
      onExtended();
    } catch (err: any) {
      console.error("[ExtendSeasonDialog]", err);
      toast.error(err?.message || "Erro ao estender temporada");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="h-4 w-4 text-primary" /> Estender temporada
          </DialogTitle>
          <DialogDescription className="text-xs">
            Novas rodadas serão criadas na sequência de <strong>{season.name}</strong>, mantendo ranking e histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-muted/10 p-3 text-[11px] text-muted-foreground">
            Última rodada: <span className="font-semibold text-foreground">
              {lastRound ? `R${lastRound.round_number} · ${fmt(lastRound.scheduled_date)}` : "sem rodadas com data"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode("until")}
              className={`rounded-xl border px-3 py-2 text-[11px] font-semibold ${
                mode === "until" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              Até uma data
            </button>
            <button
              onClick={() => setMode("count")}
              className={`rounded-xl border px-3 py-2 text-[11px] font-semibold ${
                mode === "count" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              Nº de rodadas
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {mode === "until" ? (
              <label className="col-span-1 text-[11px] text-muted-foreground">
                Estender até
                <input
                  type="date"
                  value={untilDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                />
              </label>
            ) : (
              <label className="col-span-1 text-[11px] text-muted-foreground">
                Quantas rodadas
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                />
              </label>
            )}
            <label className="col-span-1 text-[11px] text-muted-foreground">
              Intervalo (dias)
              <input
                type="number"
                min={1}
                max={60}
                value={intervalDays}
                onChange={(e) => setIntervalDays(Math.max(1, Number(e.target.value)))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-muted-foreground">
              Horário
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Local
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Opcional"
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              />
            </label>
          </div>

          <div className="rounded-xl border border-border bg-background/50 p-3">
            <p className="text-[11px] font-semibold text-foreground">
              {newDates.length} nova{newDates.length === 1 ? "" : "s"} rodada{newDates.length === 1 ? "" : "s"}
              {newDates.length > 0 && ` · R${nextNumber} até R${nextNumber + newDates.length - 1}`}
            </p>
            {newDates.length > 0 && (
              <div className="mt-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                {newDates.map((d, i) => (
                  <span key={d} className="rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    R{nextNumber + i} · {fmt(d)}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={confirm}
              disabled={saving || !newDates.length}
              className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Criando..." : `Estender com ${newDates.length} rodada${newDates.length === 1 ? "" : "s"}`}
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-xl bg-muted px-4 py-2.5 text-xs font-semibold text-muted-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
