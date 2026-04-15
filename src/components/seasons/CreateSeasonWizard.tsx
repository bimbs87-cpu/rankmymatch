import { useState } from "react";
import { X, Calendar, Pencil, LayoutGrid, History } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { createSeasonWithRounds } from "@/hooks/use-season-creation";
import { WEEKDAYS, getWeeklyDates, getMonthlyDates, formatDateBR } from "./SeasonDateUtils";

interface Props {
  groupId: string;
  onClose: () => void;
  onCreated: () => void;
}

type Step = "type" | "config" | "dates";

export function CreateSeasonWizard({ groupId, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("type");
  const [name, setName] = useState("");
  const [durationType, setDurationType] = useState<"weekly" | "monthly" | "">("");
  const [isRetroactive, setIsRetroactive] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [totalRounds, setTotalRounds] = useState(10);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [roundDates, setRoundDates] = useState<string[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [time, setTime] = useState("19:00");
  const [courts, setCourts] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSelectType = (type: "weekly" | "monthly") => {
    setDurationType(type);
    setStep("config");
  };

  const handleConfigNext = () => {
    if (!name.trim()) {
      toast.error("Informe o nome da temporada");
      return;
    }
    if (durationType === "weekly" && selectedDay === null) {
      toast.error("Selecione o dia da semana");
      return;
    }
    if (isRetroactive && !startDate) {
      toast.error("Informe a data de início");
      return;
    }
    const fromDate = isRetroactive && startDate ? startDate : undefined;
    if (durationType === "weekly" && selectedDay !== null) {
      setRoundDates(getWeeklyDates(selectedDay, totalRounds, fromDate));
    } else {
      setRoundDates(getMonthlyDates(totalRounds, fromDate));
    }
    setStep("dates");
  };

  const handleDateChange = (idx: number, newDate: string) => {
    setRoundDates((prev) => prev.map((d, i) => (i === idx ? newDate : d)));
    setEditingIdx(null);
  };

  const handleCreate = async () => {
    if (!name.trim() || !user || !roundDates.length || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await createSeasonWithRounds({
        groupId,
        name: name.trim(),
        userId: user.id,
        durationType: durationType as string,
        totalRounds,
        roundDates,
        scheduledTime: time,
        simultaneousCourts: courts,
      });
      toast.success("Temporada criada com rodadas!");
      onCreated();
      onClose();
    } catch (e: any) {
      const message = e?.message || "Erro ao criar temporada";
      console.error("[CreateSeasonWizard] Erro:", e);
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-border bg-card p-6 pb-10 sm:pb-6 animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-lg font-bold text-foreground">
            {step === "type" ? "Tipo de Temporada" : step === "config" ? "Configurar Temporada" : "Datas das Rodadas"}
          </h2>
          <button onClick={onClose} className="rounded-full bg-muted p-2">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Step 1: Choose type */}
        {step === "type" && (
          <div className="space-y-3">
            <button
              onClick={() => handleSelectType("weekly")}
              className="w-full rounded-2xl border border-border bg-background p-4 text-left transition-colors active:bg-accent/30"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Semanal</p>
                  <p className="text-xs text-muted-foreground">1 rodada por semana, em dia fixo</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => handleSelectType("monthly")}
              className="w-full rounded-2xl border border-border bg-background p-4 text-left transition-colors active:bg-accent/30"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info/10">
                  <Calendar className="h-5 w-5 text-info" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Mensal</p>
                  <p className="text-xs text-muted-foreground">1 rodada por mês, data definida pelo admin</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Step 2: Config */}
        {step === "config" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Nome *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Temporada 2026.1"
                maxLength={60}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Total de rodadas</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={4}
                  max={durationType === "monthly" ? 12 : 52}
                  value={totalRounds}
                  onChange={(e) => setTotalRounds(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="w-10 text-center font-display text-lg font-bold text-foreground">{totalRounds}</span>
              </div>
            </div>
            {durationType === "weekly" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Dia da semana *</label>
                <div className="grid grid-cols-4 gap-2">
                  {WEEKDAYS.map((wd) => (
                    <button
                      key={wd.value}
                      onClick={() => setSelectedDay(wd.value)}
                      className={`rounded-xl py-2.5 text-xs font-semibold transition-colors ${
                        selectedDay === wd.value
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-background text-foreground"
                      }`}
                    >
                      {wd.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Horário padrão</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                <LayoutGrid className="mr-1 inline h-3.5 w-3.5" />
                Quadras simultâneas
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCourts(n)}
                    className={`rounded-xl py-2.5 text-xs font-semibold transition-colors ${
                      courts === n
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-background text-foreground"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <button
                onClick={() => setIsRetroactive(!isRetroactive)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                  isRetroactive ? "border-primary bg-primary/10" : "border-border bg-background"
                }`}
              >
                <History className={`h-5 w-5 ${isRetroactive ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className={`text-sm font-semibold ${isRetroactive ? "text-primary" : "text-foreground"}`}>
                    Temporada já em andamento
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cadastrar rodadas com datas passadas
                  </p>
                </div>
              </button>
              {isRetroactive && (
                <div className="mt-2">
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data de início</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("type")}
                className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-foreground"
              >
                Voltar
              </button>
              <button
                onClick={handleConfigNext}
                className="flex-1 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground"
              >
                Próximo
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Dates preview */}
        {step === "dates" && (
          <div className="space-y-4">
            {submitError && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {submitError}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {durationType === "weekly" ? "Rodadas semanais programadas" : "Rodadas mensais programadas"}.
              Toque no lápis para alterar a data.
            </p>
            <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-2xl border border-border bg-background p-2">
              {roundDates.map((d, idx) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-accent/20">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      {idx + 1}
                    </span>
                    {editingIdx === idx ? (
                      <input
                        type="date"
                        value={d}
                        onChange={(e) => handleDateChange(idx, e.target.value)}
                        onBlur={() => setEditingIdx(null)}
                        autoFocus
                        className="rounded-lg border border-primary bg-background px-2 py-1 text-sm text-foreground focus:outline-none"
                      />
                    ) : (
                      <span className="text-sm text-foreground">{formatDateBR(d)}</span>
                    )}
                  </div>
                  {editingIdx !== idx && (
                    <button
                      onClick={() => setEditingIdx(idx)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/30"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("config")}
                className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-foreground"
              >
                Voltar
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || !roundDates.length || submitting}
                className="flex-1 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {submitting ? "Criando..." : "Criar Temporada"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
