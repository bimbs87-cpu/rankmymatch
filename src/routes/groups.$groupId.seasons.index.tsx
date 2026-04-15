import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGroupDetail } from "@/hooks/use-groups";
import { useGroupSeasons } from "@/hooks/use-seasons";
import { createSeasonWithRounds } from "@/hooks/use-season-creation";
import { ArrowLeft, Plus, Trophy, X, Calendar, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/groups/$groupId/seasons/")({
  component: GroupSeasonsPage,
});

const WEEKDAYS = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

function getUpcomingDates(dayOfWeek: number, count: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  const current = new Date(today);
  // Move to the next occurrence of the chosen day
  const diff = (dayOfWeek - current.getDay() + 7) % 7;
  current.setDate(current.getDate() + (diff === 0 && current.getHours() >= 12 ? 7 : diff));
  for (let i = 0; i < count; i++) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 7);
  }
  return dates;
}

function getUpcomingMonthlyDates(count: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i + 1, 0);
    // Last saturday of the month as default, or just mid-month
    const mid = new Date(today.getFullYear(), today.getMonth() + i, 15);
    if (mid <= today) {
      mid.setMonth(mid.getMonth() + 1);
    }
    dates.push(mid.toISOString().split("T")[0]);
  }
  return dates;
}

function GroupSeasonsPage() {
  const { groupId } = Route.useParams();
  const { user } = useAuth();
  const { group, isAdmin } = useGroupDetail(groupId);
  const { seasons, isLoading, refresh } = useGroupSeasons(groupId);
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState<"type" | "config" | "dates">("type");
  const [name, setName] = useState("");
  const [durationType, setDurationType] = useState<"weekly" | "monthly" | "">("");
  const [totalRounds, setTotalRounds] = useState(10);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [roundDates, setRoundDates] = useState<string[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [time, setTime] = useState("19:00");
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setStep("type");
    setName("");
    setDurationType("");
    setTotalRounds(10);
    setSelectedDay(null);
    setRoundDates([]);
    setEditingIdx(null);
    setTime("19:00");
  };

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
    // Generate dates
    if (durationType === "weekly" && selectedDay !== null) {
      setRoundDates(getUpcomingDates(selectedDay, totalRounds));
    } else {
      setRoundDates(getUpcomingMonthlyDates(totalRounds));
    }
    setStep("dates");
  };

  const handleDateChange = (idx: number, newDate: string) => {
    setRoundDates((prev) => prev.map((d, i) => (i === idx ? newDate : d)));
    setEditingIdx(null);
  };

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
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
      });
      toast.success("Temporada criada com rodadas!");
      setShowCreate(false);
      resetForm();
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar temporada");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateBR = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <Link
            to="/groups/$groupId"
            params={{ groupId }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-foreground">Temporadas</h1>
            <p className="text-xs text-muted-foreground">{group?.name}</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { resetForm(); setShowCreate(true); }}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova
            </button>
          )}
        </div>
      </header>

      <div className="space-y-3 px-5">
        {seasons.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Trophy className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-display text-base font-bold text-foreground">Nenhuma temporada</h3>
              <p className="text-sm text-muted-foreground">
                {isAdmin
                  ? "Crie a primeira temporada para começar o ranking."
                  : "O admin do grupo ainda não criou temporadas."}
              </p>
            </div>
          </div>
        ) : (
          seasons.map((s) => (
            <Link
              key={s.id}
              to="/groups/$groupId/seasons/$seasonId"
              params={{ groupId, seasonId: s.id }}
              className="flex items-center justify-between rounded-2xl border border-border bg-card/50 p-4 transition-colors active:bg-accent/30"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Trophy className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-foreground">{s.name}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.status === "active" ? "bg-success" : "bg-muted-foreground"}`} />
                    <span className="capitalize">{s.status === "active" ? "Ativa" : s.status === "finished" ? "Encerrada" : s.status}</span>
                    {s.total_rounds && <span>• {s.total_rounds} rodadas</span>}
                    {s.duration_type && (
                      <span>• {s.duration_type === "weekly" ? "Semanal" : "Mensal"}</span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-border bg-card p-6 pb-10 sm:pb-6 animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-lg font-bold text-foreground">
                {step === "type" ? "Tipo de Temporada" : step === "config" ? "Configurar Temporada" : "Datas das Rodadas"}
              </h2>
              <button onClick={() => setShowCreate(false)} className="rounded-full bg-muted p-2">
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
                    disabled={!name.trim() || submitting}
                    className="flex-1 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {submitting ? "Criando..." : "Criar Temporada"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
