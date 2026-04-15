import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGroupDetail } from "@/hooks/use-groups";
import { useGroupSeasons, createSeason } from "@/hooks/use-seasons";
import { ArrowLeft, Plus, Trophy, Calendar, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/groups/$groupId/seasons/")({
  component: GroupSeasonsPage,
});

function GroupSeasonsPage() {
  const { groupId } = Route.useParams();
  const { user } = useAuth();
  const { group, isAdmin } = useGroupDetail(groupId);
  const { seasons, isLoading, refresh } = useGroupSeasons(groupId);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [totalRounds, setTotalRounds] = useState(10);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    setSubmitting(true);
    try {
      await createSeason({
        groupId,
        name: name.trim(),
        userId: user.id,
        totalRounds,
      });
      toast.success("Temporada criada!");
      setShowCreate(false);
      setName("");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar temporada");
    } finally {
      setSubmitting(false);
    }
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
              onClick={() => setShowCreate(true)}
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
          <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-border bg-card p-6 pb-10 sm:pb-6 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-lg font-bold text-foreground">Nova Temporada</h2>
              <button onClick={() => setShowCreate(false)} className="rounded-full bg-muted p-2">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
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
                    max={52}
                    value={totalRounds}
                    onChange={(e) => setTotalRounds(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-10 text-center font-display text-lg font-bold text-foreground">{totalRounds}</span>
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || submitting}
                className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {submitting ? "Criando..." : "Criar Temporada"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}