import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGroupDetail } from "@/hooks/use-groups";
import { useGroupSeasons } from "@/hooks/use-seasons";
import { createSeasonWithRounds } from "@/hooks/use-season-creation";
import { ArrowLeft, Plus, Trophy, X, Calendar, Pencil, MoreVertical, Trash2, EyeOff, Eye, CheckCircle, LayoutGrid, History } from "lucide-react";
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [courts, setCourts] = useState(1);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [actionConfirm, setActionConfirm] = useState<{ id: string; action: "delete" | "deactivate" | "finish" | "activate" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const resetForm = () => {
    setStep("type");
    setName("");
    setDurationType("");
    setTotalRounds(10);
    setSelectedDay(null);
    setRoundDates([]);
    setEditingIdx(null);
    setTime("19:00");
    setSubmitError(null);
    setCourts(1);
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

  const formatDateBR = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  };

  const handleSeasonAction = async () => {
    if (!actionConfirm) return;
    setActionLoading(true);
    try {
      if (actionConfirm.action === "delete") {
        // Delete rounds first, then season
        await supabase.from("rounds").delete().eq("season_id", actionConfirm.id);
        const { error } = await supabase.from("seasons").delete().eq("id", actionConfirm.id);
        if (error) throw error;
        toast.success("Temporada excluída");
      } else if (actionConfirm.action === "deactivate") {
        const { error } = await supabase.from("seasons").update({ status: "inactive" }).eq("id", actionConfirm.id);
        if (error) throw error;
        toast.success("Temporada desativada");
      } else if (actionConfirm.action === "activate") {
        const { error } = await supabase.from("seasons").update({ status: "active" }).eq("id", actionConfirm.id);
        if (error) throw error;
        toast.success("Temporada reativada");
      } else if (actionConfirm.action === "finish") {
        const { error } = await supabase.from("seasons").update({ status: "finished" }).eq("id", actionConfirm.id);
        if (error) throw error;
        toast.success("Temporada concluída");
      }
      setActionConfirm(null);
      setMenuOpenId(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao processar ação");
    } finally {
      setActionLoading(false);
    }
  };

  const visibleSeasons = showInactive ? seasons : seasons.filter((s) => s.status !== "inactive");
  const hasInactive = seasons.some((s) => s.status === "inactive");

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
        {hasInactive && (
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
          >
            {showInactive ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showInactive ? "Ocultar desativadas" : "Mostrar desativadas"}
          </button>
        )}
        {visibleSeasons.length === 0 ? (
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
          visibleSeasons.map((s) => (
            <div
              key={s.id}
              className={`relative rounded-2xl border border-border bg-card/50 transition-colors ${s.status === "inactive" ? "opacity-60" : ""}`}
            >
              <Link
                to="/groups/$groupId/seasons/$seasonId"
                params={{ groupId, seasonId: s.id }}
                className="flex items-center justify-between p-4 active:bg-accent/30"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Trophy className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-foreground">{s.name}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.status === "active" ? "bg-success" : s.status === "inactive" ? "bg-warning" : "bg-muted-foreground"}`} />
                      <span className="capitalize">{s.status === "active" ? "Ativa" : s.status === "finished" ? "Encerrada" : s.status === "inactive" ? "Desativada" : s.status}</span>
                      {s.total_rounds && <span>• {s.total_rounds} rodadas</span>}
                    </div>
                  </div>
                </div>
              </Link>
              {isAdmin && (
                <div className="absolute right-2 top-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === s.id ? null : s.id); }}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/30"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {menuOpenId === s.id && (
                    <div className="absolute right-0 top-8 z-10 w-44 rounded-xl border border-border bg-card shadow-lg py-1">
                      {s.status === "active" && (
                        <>
                          <button
                            onClick={() => { setActionConfirm({ id: s.id, action: "finish" }); setMenuOpenId(null); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent/30"
                          >
                            <CheckCircle className="h-3.5 w-3.5 text-success" />
                            Concluir temporada
                          </button>
                          <button
                            onClick={() => { setActionConfirm({ id: s.id, action: "deactivate" }); setMenuOpenId(null); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent/30"
                          >
                            <EyeOff className="h-3.5 w-3.5 text-warning" />
                            Desativar (ocultar)
                          </button>
                        </>
                      )}
                      {s.status === "inactive" && (
                        <button
                          onClick={() => { setActionConfirm({ id: s.id, action: "activate" }); setMenuOpenId(null); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent/30"
                        >
                          <Eye className="h-3.5 w-3.5 text-success" />
                          Reativar temporada
                        </button>
                      )}
                      <button
                        onClick={() => { setActionConfirm({ id: s.id, action: "delete" }); setMenuOpenId(null); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir temporada
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Action confirmation dialog */}
      {actionConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setActionConfirm(null)} />
          <div className="relative w-[90%] max-w-sm rounded-3xl border border-border bg-card p-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-4 text-center">
              {actionConfirm.action === "delete" ? (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
                    <Trash2 className="h-7 w-7 text-destructive" />
                  </div>
                  <h3 className="font-display text-base font-bold text-foreground">Excluir temporada?</h3>
                  <p className="text-sm text-muted-foreground">
                    A temporada e todas as suas rodadas serão <strong className="text-foreground">permanentemente excluídas</strong>. 
                    Considere <strong className="text-foreground">desativar</strong> para apenas ocultar.
                  </p>
                </>
              ) : actionConfirm.action === "deactivate" ? (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10">
                    <EyeOff className="h-7 w-7 text-warning" />
                  </div>
                  <h3 className="font-display text-base font-bold text-foreground">Desativar temporada?</h3>
                  <p className="text-sm text-muted-foreground">
                    A temporada ficará oculta para os membros. Você poderá reativá-la a qualquer momento.
                  </p>
                </>
              ) : actionConfirm.action === "activate" ? (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
                    <Eye className="h-7 w-7 text-success" />
                  </div>
                  <h3 className="font-display text-base font-bold text-foreground">Reativar temporada?</h3>
                  <p className="text-sm text-muted-foreground">
                    A temporada voltará a ser visível para todos os membros do grupo.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
                    <CheckCircle className="h-7 w-7 text-success" />
                  </div>
                  <h3 className="font-display text-base font-bold text-foreground">Concluir temporada?</h3>
                  <p className="text-sm text-muted-foreground">
                    A temporada será marcada como encerrada. Os resultados serão mantidos.
                  </p>
                </>
              )}
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setActionConfirm(null)}
                  className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-foreground"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSeasonAction}
                  disabled={actionLoading}
                  className={`flex-1 rounded-2xl py-3 text-sm font-bold text-primary-foreground disabled:opacity-50 ${
                    actionConfirm.action === "delete" ? "bg-destructive" : actionConfirm.action === "deactivate" ? "bg-warning" : "bg-primary"
                  }`}
                >
                  {actionLoading ? "Processando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
      )}
    </div>
  );
}
