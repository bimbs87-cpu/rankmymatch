import { useMemo, useState } from "react";
import { X, Loader2, Trophy, Calendar as CalendarIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createSeason } from "@/lib/season-actions";
import { createSeasonWithRounds } from "@/hooks/use-season-creation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  groupId: string;
  defaultMatchFormat?: string; // doubles | singles
  fixedDay?: number | null; // 0..6 (Sun..Sat) from group
  onClose: () => void;
  onCreated: () => void;
}

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function toISO(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function nextWeekday(from: Date, weekday: number) {
  const d = new Date(from);
  const diff = (weekday - d.getDay() + 7) % 7 || 7; // next occurrence (not today)
  d.setDate(d.getDate() + diff);
  return d;
}
function generateRoundDates(startISO: string, weekday: number, count: number, intervalWeeks = 1) {
  const start = new Date(startISO + "T00:00:00");
  // Anchor to the chosen weekday on/after start
  const anchorDiff = (weekday - start.getDay() + 7) % 7;
  const anchor = new Date(start);
  anchor.setDate(anchor.getDate() + anchorDiff);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + i * 7 * intervalWeeks);
    out.push(toISO(d));
  }
  return out;
}

// Compute Easter Sunday (Anonymous Gregorian / Meeus algorithm)
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March,4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// Brazilian national holidays (fixed + Easter-derived) for a given year.
// Returns a list of { iso, name } entries.
function brHolidaysForYear(year: number): { iso: string; name: string }[] {
  const out: { iso: string; name: string }[] = [];
  const fixed: [number, number, string][] = [
    [1, 1, "Confraternização Universal"],
    [4, 21, "Tiradentes"],
    [5, 1, "Dia do Trabalho"],
    [9, 7, "Independência"],
    [10, 12, "Nossa Sra. Aparecida"],
    [11, 2, "Finados"],
    [11, 15, "Proclamação da República"],
    [11, 20, "Consciência Negra"],
    [12, 25, "Natal"],
  ];
  for (const [m, d, name] of fixed) out.push({ iso: toISO(new Date(year, m - 1, d)), name });
  const easter = easterSunday(year);
  out.push({ iso: toISO(addDays(easter, -48)), name: "Carnaval (segunda)" });
  out.push({ iso: toISO(addDays(easter, -47)), name: "Carnaval (terça)" });
  out.push({ iso: toISO(addDays(easter, -2)), name: "Sexta-feira Santa" });
  out.push({ iso: toISO(easter), name: "Páscoa" });
  out.push({ iso: toISO(addDays(easter, 60)), name: "Corpus Christi" });
  return out;
}

// Returns holidays (with names) that fall on any of the given generated dates.
function brHolidaysMatchingDates(dates: string[]): { iso: string; name: string }[] {
  if (!dates.length) return [];
  const dateSet = new Set(dates);
  const years = new Set(dates.map((d) => Number(d.slice(0, 4))));
  const matches: { iso: string; name: string }[] = [];
  for (const y of years) {
    for (const h of brHolidaysForYear(y)) {
      if (dateSet.has(h.iso)) matches.push(h);
    }
  }
  // sort by date
  matches.sort((a, b) => a.iso.localeCompare(b.iso));
  return matches;
}

export function QuickCreateSeasonDialog({
  groupId,
  defaultMatchFormat,
  fixedDay,
  onClose,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [totalRounds, setTotalRounds] = useState<number>(8);
  const [matchFormat, setMatchFormat] = useState<string>(
    defaultMatchFormat === "singles" ? "singles" : "doubles"
  );
  const [saving, setSaving] = useState(false);

  // Date generator (optional)
  const [generateDates, setGenerateDates] = useState<boolean>(fixedDay != null);
  const todayISO = useMemo(() => toISO(new Date()), []);
  const initialWeekday = fixedDay ?? new Date().getDay();
  const [weekday, setWeekday] = useState<number>(initialWeekday);
  const [startDate, setStartDate] = useState<string>(() =>
    toISO(nextWeekday(new Date(), initialWeekday))
  );
  const [intervalWeeks, setIntervalWeeks] = useState<number>(1);
  const [scheduledTime, setScheduledTime] = useState<string>("19:00");
  const [excludedDates, setExcludedDates] = useState<Set<string>>(new Set());
  const [showHolidayPicker, setShowHolidayPicker] = useState(false);

  const generatedDates = useMemo(() => {
    if (!generateDates) return [];
    return generateRoundDates(startDate, weekday, totalRounds + excludedDates.size, intervalWeeks);
  }, [generateDates, startDate, weekday, totalRounds, intervalWeeks, excludedDates.size]);

  const previewDates = useMemo(() => {
    return generatedDates.filter((d) => !excludedDates.has(d)).slice(0, totalRounds);
  }, [generatedDates, excludedDates, totalRounds]);

  const toggleExclude = (d: string) => {
    setExcludedDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

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
      let seasonId: string;
      if (generateDates) {
        // Generate enough then drop excluded ones, keeping totalRounds
        const all = generateRoundDates(startDate, weekday, totalRounds + excludedDates.size, intervalWeeks);
        const dates = all.filter((d) => !excludedDates.has(d)).slice(0, totalRounds);
        const season = await createSeasonWithRounds({
          groupId,
          name: trimmed,
          userId: user.id,
          durationType: "custom",
          totalRounds,
          roundDates: dates,
          scheduledTime: scheduledTime ? `${scheduledTime}:00` : undefined,
          matchFormat,
        });
        seasonId = season.id;
      } else {
        const season = await createSeason({
          groupId,
          name: trimmed,
          userId: user.id,
          matchFormat,
          totalRounds,
        });
        seasonId = season.id;
        // Best-effort notify
        try {
          await supabase.from("notifications").insert({
            user_id: user.id,
            group_id: groupId,
            type: "season_created",
            title: "Nova temporada! 🏆",
            body: `${trimmed} foi criada com ${totalRounds} rodada${totalRounds === 1 ? "" : "s"}.`,
            data: { seasonId },
          });
        } catch {
          /* ignore */
        }
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-5 shadow-2xl"
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
                if (e.key === "Enter" && !saving && !generateDates) submit();
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

          {/* Date generator */}
          <div className="rounded-2xl border border-border bg-background/40 p-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={generateDates}
                onChange={(e) => setGenerateDates(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-bold text-foreground">
                    Gerar datas das rodadas automaticamente
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Cria todas as rodadas já agendadas no dia da semana escolhido. Você pode editar
                  cada uma depois.
                </p>
              </div>
            </label>

            {generateDates && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Dia da semana
                    </label>
                    <select
                      value={weekday}
                      onChange={(e) => setWeekday(Number(e.target.value))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {WEEKDAYS.map((w, i) => (
                        <option key={i} value={i}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      A cada
                    </label>
                    <select
                      value={intervalWeeks}
                      onChange={(e) => setIntervalWeeks(Number(e.target.value))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value={1}>Toda semana</option>
                      <option value={2}>2 semanas</option>
                      <option value={3}>3 semanas</option>
                      <option value={4}>Mensal (4s)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Data inicial
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      min={todayISO}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Horário
                    </label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                {generatedDates.length > 0 && (
                  <div className="rounded-xl border border-dashed border-border bg-card/40 p-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Prévia ({previewDates.length} de {totalRounds})
                        </span>
                      </div>
                      {excludedDates.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setExcludedDates(new Set())}
                          className="text-[10px] font-semibold text-primary hover:underline"
                        >
                          Limpar excluídas
                        </button>
                      )}
                    </div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-[10px] text-muted-foreground">
                        Clique em uma data para excluí-la (ex.: feriados).
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowHolidayPicker(true)}
                        className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-bold text-foreground hover:bg-muted"
                        title="Selecionar feriados a pular (BR + customizados)"
                      >
                        🇧🇷 Pular feriados…
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {generatedDates.slice(0, Math.min(generatedDates.length, totalRounds + 6)).map((d) => {
                        const dt = new Date(d + "T00:00:00");
                        const isExcluded = excludedDates.has(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleExclude(d)}
                            className={`rounded-lg px-2 py-0.5 text-[10px] font-medium transition-colors ${
                              isExcluded
                                ? "bg-muted/40 text-muted-foreground line-through"
                                : "bg-primary/10 text-primary hover:bg-primary/20"
                            }`}
                            title={isExcluded ? "Clique para incluir" : "Clique para excluir"}
                          >
                            {dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
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

      {showHolidayPicker && (
        <HolidayPickerDialog
          generatedDates={generatedDates}
          excludedDates={excludedDates}
          onClose={() => setShowHolidayPicker(false)}
          onApply={(toExclude) => {
            setExcludedDates((prev) => {
              const next = new Set(prev);
              for (const d of toExclude) next.add(d);
              return next;
            });
            setShowHolidayPicker(false);
            if (toExclude.length > 0) {
              toast.success(
                `${toExclude.length} data${toExclude.length === 1 ? "" : "s"} excluída${toExclude.length === 1 ? "" : "s"}`,
              );
            }
          }}
        />
      )}
    </div>
  );
}

/* ============= Holiday picker sub-dialog ============= */
interface HolidayPickerProps {
  generatedDates: string[];
  excludedDates: Set<string>;
  onClose: () => void;
  onApply: (datesToExclude: string[]) => void;
}

function HolidayPickerDialog({ generatedDates, excludedDates, onClose, onApply }: HolidayPickerProps) {
  const matches = useMemo(() => brHolidaysMatchingDates(generatedDates), [generatedDates]);
  // Pre-select matches that aren't already excluded; show as checked by default.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(matches.map((m) => m.iso)));
  const [customDate, setCustomDate] = useState<string>("");
  const [customLabel, setCustomLabel] = useState<string>("");
  const [customs, setCustoms] = useState<{ iso: string; name: string }[]>([]);

  const toggle = (iso: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  };

  const addCustom = () => {
    if (!customDate) {
      toast.error("Escolha uma data");
      return;
    }
    if (!generatedDates.includes(customDate)) {
      toast.error("Esta data não está na prévia gerada");
      return;
    }
    if (customs.some((c) => c.iso === customDate) || matches.some((m) => m.iso === customDate)) {
      toast.info("Data já listada");
      return;
    }
    const label = customLabel.trim() || "Feriado customizado";
    setCustoms((prev) => [...prev, { iso: customDate, name: label }]);
    setSelected((prev) => new Set(prev).add(customDate));
    setCustomDate("");
    setCustomLabel("");
  };

  const allItems = [...matches, ...customs];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-foreground">Pular feriados</h3>
            <p className="text-[11px] text-muted-foreground">
              Selecione quais datas excluir. Inclua feriados estaduais/municipais customizados.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Feriados encontrados na prévia
            </p>
            {allItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/10 p-3 text-xs text-muted-foreground">
                Nenhum feriado nacional BR coincide com as datas geradas.
              </p>
            ) : (
              <ul className="space-y-1">
                {allItems.map((h) => {
                  const dt = new Date(h.iso + "T00:00:00");
                  const isSel = selected.has(h.iso);
                  const alreadyExcluded = excludedDates.has(h.iso);
                  return (
                    <li key={h.iso}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background/40 p-2.5 hover:bg-background/70">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggle(h.iso)}
                          className="h-4 w-4 accent-primary"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">{h.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {dt.toLocaleDateString("pt-BR", {
                              weekday: "short",
                              day: "2-digit",
                              month: "long",
                              year: "numeric",
                            })}
                            {alreadyExcluded && " · já excluída"}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-dashed border-border bg-background/30 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Adicionar feriado customizado
            </p>
            <div className="flex flex-col gap-2">
              <select
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Escolha uma data da prévia…</option>
                {generatedDates
                  .filter((d) => !matches.some((m) => m.iso === d) && !customs.some((c) => c.iso === d))
                  .map((d) => {
                    const dt = new Date(d + "T00:00:00");
                    return (
                      <option key={d} value={d}>
                        {dt.toLocaleDateString("pt-BR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </option>
                    );
                  })}
              </select>
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                maxLength={40}
                placeholder="Nome (ex.: Aniversário da cidade)"
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={addCustom}
                className="self-start rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary hover:bg-primary/20"
              >
                + Adicionar
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            onClick={() => onApply(Array.from(selected))}
            disabled={selected.size === 0}
            className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            Aplicar ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
