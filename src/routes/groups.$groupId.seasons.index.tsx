import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGroupDetail } from "@/hooks/use-groups";
import { useGroupSeasons } from "@/hooks/use-seasons";
import { createSeasonWithRounds } from "@/hooks/use-season-creation";
import { isRivalryGroup } from "@/lib/rivalry";
import { ArrowLeft, Plus, Trophy, X, Calendar, Pencil, MoreVertical, EyeOff, CheckCircle2, Trash2 } from "lucide-react";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { WizardStepper } from "@/components/ui/wizard-stepper";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
  { value: -1, label: "Dias alternados" },
];

const COURT_OPTIONS = [1, 2, 3, 4];

function parseISODateLocal(iso: string): Date {
  // Parse YYYY-MM-DD as local date (avoid UTC shift)
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getUpcomingDates(dayOfWeek: number, count: number, roundsPlayed = 0, startDate?: string): string[] {
  const dates: string[] = [];
  const anchor = startDate ? parseISODateLocal(startDate) : new Date();
  const current = new Date(anchor);
  if (!startDate) {
    // Find the next occurrence of the chosen day from today
    const diff = (dayOfWeek - current.getDay() + 7) % 7;
    current.setDate(current.getDate() + (diff === 0 && current.getHours() >= 12 ? 7 : diff === 0 ? 0 : diff));
    // Without an explicit start date, shift backward to include past rounds
    if (roundsPlayed > 0) {
      current.setDate(current.getDate() - (roundsPlayed * 7));
    }
  }
  // When startDate is provided, it IS round 1 — do not shift.
  for (let i = 0; i < count; i++) {
    dates.push(toISODate(current));
    current.setDate(current.getDate() + 7);
  }
  return dates;
}

function getUpcomingMonthlyDates(count: number, roundsPlayed = 0, startDate?: string): string[] {
  const dates: string[] = [];
  const anchor = startDate ? parseISODateLocal(startDate) : new Date();
  // When startDate is provided, it IS round 1. Otherwise, shift back by roundsPlayed.
  const startOffset = startDate ? 0 : (roundsPlayed > 0 ? -roundsPlayed : 0);
  for (let i = 0; i < count; i++) {
    const month = anchor.getMonth() + startOffset + i;
    const day = startDate ? anchor.getDate() : 15;
    const d = new Date(anchor.getFullYear(), month, day);
    dates.push(toISODate(d));
  }
  return dates;
}

function GroupSeasonsPage() {
  const { groupId } = Route.useParams();
  const { user } = useAuth();
  const { group, memberCount, isAdmin } = useGroupDetail(groupId);
  const { seasons, isLoading, refresh } = useGroupSeasons(groupId);
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState<"type" | "config" | "dates">("type");
  const [stepDir, setStepDir] = useState<"forward" | "back">("forward");
  const [name, setName] = useState("");
  const [durationType, setDurationType] = useState<"weekly" | "monthly" | "">("");
  const [totalRounds, setTotalRounds] = useState(10);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [roundDates, setRoundDates] = useState<string[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [time, setTime] = useState("19:00");
  const [courts, setCourts] = useState(1);
  const [isRetroactive, setIsRetroactive] = useState(false);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [startDate, setStartDate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const isSingles = group?.match_format === "singles";
  const rivalry = isRivalryGroup(group, memberCount);
  // Singles-specific
  const [setsPerMatch, setSetsPerMatch] = useState(3);
  const [singlesPairingMode, setSinglesPairingMode] = useState("manual");
  const [oddPlayerRule, setOddPlayerRule] = useState("admin_decides");

  const goStep = (next: "type" | "config" | "dates", dir: "forward" | "back") => {
    setStepDir(dir);
    setStep(next);
  };

  const resetForm = () => {
    setStep("type");
    setStepDir("forward");
    setName("");
    setDurationType("");
    setTotalRounds(10);
    setSelectedDay(null);
    setRoundDates([]);
    setEditingIdx(null);
    setTime("19:00");
    setCourts(1);
    setIsRetroactive(false);
    setRoundsPlayed(0);
    setStartDate("");
    setSubmitError(null);
    setSetsPerMatch(rivalry ? 1 : 3);
    setSinglesPairingMode("manual");
    setOddPlayerRule("admin_decides");
  };

  const handleSelectType = (type: "weekly" | "monthly") => {
    setDurationType(type);
    goStep("config", "forward");
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
    const pastRounds = isRetroactive ? roundsPlayed : 0;
    const anchor = startDate || undefined;
    if (durationType === "weekly" && selectedDay !== null) {
      if (selectedDay === -1) {
        // Dias alternados: weekly cadence from anchor (or today)
        const dates: string[] = [];
        const base = anchor ? parseISODateLocal(anchor) : new Date();
        if (pastRounds > 0) {
          base.setDate(base.getDate() - pastRounds * 7);
        }
        for (let i = 0; i < totalRounds; i++) {
          const d = new Date(base);
          d.setDate(d.getDate() + i * 7);
          dates.push(toISODate(d));
        }
        setRoundDates(dates);
      } else {
        setRoundDates(getUpcomingDates(selectedDay, totalRounds, pastRounds, anchor));
      }
    } else {
      setRoundDates(getUpcomingMonthlyDates(totalRounds, pastRounds, anchor));
    }
    goStep("dates", "forward");
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
        matchFormat: group?.match_format || "doubles",
        setsPerMatch: isSingles ? setsPerMatch : undefined,
        singlesPairingMode: isSingles ? singlesPairingMode : undefined,
        oddPlayerRule: isSingles ? oddPlayerRule : undefined,
      });

      // Update group's simultaneous_courts if different
      if (courts !== (group?.simultaneous_courts ?? 1)) {
        await supabase
          .from("groups")
          .update({ simultaneous_courts: courts })
          .eq("id", groupId);
      }

      toast.success("Temporada criada com rodadas!");
      setShowCreate(false);
      resetForm();
      refresh();
    } catch (e: any) {
      const message = e?.message || "Erro ao criar temporada";
      console.error("[GroupSeasonsPage] Erro ao criar temporada:", e);
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSeasonAction = async (seasonId: string, action: "deactivate" | "activate" | "finish" | "delete") => {
    setMenuOpenId(null);
    try {
      if (action === "delete") {
        // Delete rounds first, then season
        await supabase.from("rounds").delete().eq("season_id", seasonId);
        await supabase.from("seasons").delete().eq("id", seasonId);
        toast.success("Temporada excluída");
      } else if (action === "deactivate") {
        await supabase.from("seasons").update({ status: "hidden" }).eq("id", seasonId);
        toast.success("Temporada ocultada");
      } else if (action === "activate") {
        await supabase.from("seasons").update({ status: "active" }).eq("id", seasonId);
        toast.success("Temporada reativada");
      } else if (action === "finish") {
        await supabase.from("seasons").update({ status: "finished" }).eq("id", seasonId);
        toast.success("Temporada concluída");
      }
      refresh();
    } catch (e) {
      toast.error("Erro ao atualizar temporada");
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

  const visibleSeasons = seasons.filter((s) => s.status !== "hidden");
  const hiddenSeasons = seasons.filter((s) => s.status === "hidden");

  if (isLoading) {
    return <TrophyLoadingBar />;
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
        {visibleSeasons.length === 0 && hiddenSeasons.length === 0 ? (
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
          <>
            {visibleSeasons.map((s) => (
              <div key={s.id} className="relative">
                <Link
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
                      </div>
                    </div>
                  </div>
                </Link>
                {isAdmin && (
                  <div className="absolute right-2 top-2">
                    <button
                      onClick={(e) => { e.preventDefault(); setMenuOpenId(menuOpenId === s.id ? null : s.id); }}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/30"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {menuOpenId === s.id && (
                      <div className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                        {s.status === "active" && (
                          <button
                            onClick={() => handleSeasonAction(s.id, "finish")}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-foreground hover:bg-accent/30"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            Concluir
                          </button>
                        )}
                        <button
                          onClick={() => handleSeasonAction(s.id, "deactivate")}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-foreground hover:bg-accent/30"
                        >
                          <EyeOff className="h-3.5 w-3.5 text-warning" />
                          Ocultar
                        </button>
                        <button
                          onClick={() => handleSeasonAction(s.id, "delete")}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-destructive hover:bg-accent/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Hidden seasons toggle */}
            {isAdmin && hiddenSeasons.length > 0 && (
              <>
                <button
                  onClick={() => setShowHidden(!showHidden)}
                  className="flex w-full items-center justify-center gap-2 py-2 text-xs text-muted-foreground"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  {showHidden ? "Ocultar" : `Mostrar ${hiddenSeasons.length} temporada(s) oculta(s)`}
                </button>
                {showHidden && hiddenSeasons.map((s) => (
                  <div key={s.id} className="relative opacity-60">
                    <div className="flex items-center justify-between rounded-2xl border border-dashed border-border bg-card/30 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/30">
                          <Trophy className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-muted-foreground">{s.name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <EyeOff className="h-3 w-3" />
                            <span>Oculta</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleSeasonAction(s.id, "activate")}
                          className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                        >
                          Reativar
                        </button>
                        <button
                          onClick={() => handleSeasonAction(s.id, "delete")}
                          className="rounded-lg bg-destructive/10 p-1.5 text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pb-28 pt-6 sm:px-6 sm:pb-6 sm:pt-6">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-6 pb-8 animate-in zoom-in-95 fade-in-0 duration-200 max-h-[calc(100vh-8rem)] overflow-y-auto sm:max-h-[85vh] sm:pb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-foreground">
                {step === "type" ? "Tipo de Temporada" : step === "config" ? "Configurar Temporada" : "Datas das Rodadas"}
              </h2>
              <button onClick={() => setShowCreate(false)} className="rounded-full bg-muted p-2">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <WizardStepper
              steps={[
                { key: "type", label: "Tipo" },
                { key: "config", label: "Config" },
                { key: "dates", label: "Datas" },
              ]}
              currentStep={step}
              className="mb-6"
            />

            {/* Step 1: Choose type */}
            {step === "type" && (
              <div key="step-type" className={`space-y-3 ${stepDir === "forward" ? "animate-step-forward" : "animate-step-back"}`}>
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
              <div key="step-config" className={`space-y-4 ${stepDir === "forward" ? "animate-step-forward" : "animate-step-back"}`}>
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
                {/* Courts - hide for rivalry */}
                {!rivalry && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Quadras simultâneas</label>
                  <div className="flex gap-2">
                    {COURT_OPTIONS.map((n) => (
                      <button
                        key={n}
                        onClick={() => setCourts(n)}
                        className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                          courts === n
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-background text-foreground"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">Quantas quadras serão usadas ao mesmo tempo nas rodadas</p>
                </div>
                )}
                {/* Singles-specific config */}
                {isSingles && (
                  <>
                    {/* Hide sets config for rivalry — defaults to 1 set, user adds more in score dialog */}
                    {!rivalry && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Sets por confronto</label>
                      <div className="flex gap-2">
                        {[1, 3].map((n) => (
                          <button
                            key={n}
                            onClick={() => setSetsPerMatch(n)}
                            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                              setsPerMatch === n
                                ? "bg-primary text-primary-foreground"
                                : "border border-border bg-background text-foreground"
                            }`}
                          >
                            {n} set{n !== 1 ? "s" : ""}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {setsPerMatch === 3 ? "Melhor de 3 sets por confronto" : "1 set por confronto"}
                      </p>
                    </div>
                    )}
                    {/* Hide pairing mode and odd player rule for rivalry */}
                    {!rivalry && (
                      <>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Formação dos confrontos</label>
                          <div className="space-y-1.5">
                            {[
                              { value: "manual", label: "Manual pelo admin", desc: "Admin define quem joga contra quem" },
                              { value: "random", label: "Sorteio automático", desc: "Confrontos sorteados aleatoriamente" },
                              { value: "round_robin", label: "Rodízio (todos contra todos)", desc: "Cada jogador enfrenta todos os outros" },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setSinglesPairingMode(opt.value)}
                                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                                  singlesPairingMode === opt.value
                                    ? "border-primary bg-primary/5"
                                    : "border-border bg-background"
                                }`}
                              >
                                <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                                  singlesPairingMode === opt.value ? "border-primary" : "border-muted-foreground"
                                }`}>
                                  {singlesPairingMode === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                                  <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Se sobrar jogador na rodada</label>
                          <div className="space-y-1.5">
                            {[
                              { value: "bye", label: "Bye sem pontuação", desc: "Jogador descansa sem ganhar pontos" },
                              { value: "queue_point", label: "Fila com +1 ponto simbólico", desc: "Jogador ganha 1 ponto por estar presente" },
                              { value: "admin_decides", label: "Admin decide manualmente", desc: "Decisão caso a caso" },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setOddPlayerRule(opt.value)}
                                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                                  oddPlayerRule === opt.value
                                    ? "border-primary bg-primary/5"
                                    : "border-border bg-background"
                                }`}
                              >
                                <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                                  oddPlayerRule === opt.value ? "border-primary" : "border-muted-foreground"
                                }`}>
                                  {oddPlayerRule === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                                  <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
                <div>
                  <button
                    type="button"
                    onClick={() => { setIsRetroactive(!isRetroactive); if (isRetroactive) setRoundsPlayed(0); }}
                    className={`flex w-full items-center justify-between rounded-2xl border p-3 transition-colors ${
                      isRetroactive ? "border-primary bg-primary/5" : "border-border bg-background"
                    }`}
                  >
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">Temporada em andamento</p>
                      <p className="text-[10px] text-muted-foreground">Já jogaram rodadas antes? Inclua datas passadas</p>
                    </div>
                    <div className={`flex h-5 w-9 items-center rounded-full transition-colors ${isRetroactive ? "bg-primary" : "bg-muted"}`}>
                      <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${isRetroactive ? "translate-x-4" : "translate-x-0.5"}`} />
                    </div>
                  </button>
                  {isRetroactive && (
                    <div className="mt-2 space-y-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Data de início da temporada</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "flex w-full items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5 text-sm",
                                !startDate && "text-muted-foreground"
                              )}
                            >
                              <span>{startDate ? formatDateBR(startDate) : "Selecionar data"}</span>
                              <Calendar className="h-4 w-4 opacity-60" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarPicker
                              mode="single"
                              selected={startDate ? parseISODateLocal(startDate) : undefined}
                              onSelect={(date) => date && setStartDate(toISODate(date))}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Data da 1ª rodada (passada). As demais serão geradas em sequência.
                        </p>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Rodadas já realizadas</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={1}
                            max={Math.max(1, totalRounds - 1)}
                            value={roundsPlayed}
                            onChange={(e) => setRoundsPlayed(Number(e.target.value))}
                            className="flex-1 accent-primary"
                          />
                          <span className="w-10 text-center font-display text-lg font-bold text-foreground">{roundsPlayed}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {roundsPlayed} rodada(s) no passado + {totalRounds - roundsPlayed} futuras
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => goStep("type", "back")}
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
              <div key="step-dates" className={`space-y-4 ${stepDir === "forward" ? "animate-step-forward" : "animate-step-back"}`}>
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
                  {roundDates.map((d, idx) => {
                    const today = new Date().toISOString().split("T")[0];
                    const isPast = d < today;
                    return (
                    <div key={idx} className={`flex items-center justify-between px-3 py-2 rounded-xl hover:bg-accent/20 ${isPast ? "opacity-70" : ""}`}>
                      <div className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${isPast ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>
                          {idx + 1}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-foreground">{formatDateBR(d)}</span>
                          {isPast && <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[9px] font-medium text-warning">passada</span>}
                        </div>
                      </div>
                      <Popover
                        open={editingIdx === idx}
                        onOpenChange={(open) => setEditingIdx(open ? idx : null)}
                      >
                        <PopoverTrigger asChild>
                          <button
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/30"
                            aria-label="Alterar data"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <CalendarPicker
                            mode="single"
                            selected={d ? new Date(`${d}T12:00:00`) : undefined}
                            onSelect={(date) => {
                              if (date) {
                                const yyyy = date.getFullYear();
                                const mm = String(date.getMonth() + 1).padStart(2, "0");
                                const dd = String(date.getDate()).padStart(2, "0");
                                handleDateChange(idx, `${yyyy}-${mm}-${dd}`);
                              }
                            }}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    );
                  })}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => goStep("config", "back")}
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
      )}
    </div>
  );
}
