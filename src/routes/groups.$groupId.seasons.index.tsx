import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGroupDetail } from "@/hooks/use-groups";
import { useGroupSeasons } from "@/hooks/use-seasons";
import { ArrowLeft, Plus, Trophy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SeasonCard, type SeasonAction } from "@/components/seasons/SeasonCard";
import { SeasonActionDialog } from "@/components/seasons/SeasonActionDialog";
import { CreateSeasonWizard } from "@/components/seasons/CreateSeasonWizard";

export const Route = createFileRoute("/groups/$groupId/seasons/")({
  component: GroupSeasonsPage,
});

function GroupSeasonsPage() {
  const { groupId } = Route.useParams();
  const { group, isAdmin } = useGroupDetail(groupId);
  const { seasons, isLoading, refresh } = useGroupSeasons(groupId);
  const [showCreate, setShowCreate] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [actionConfirm, setActionConfirm] = useState<{ id: string; action: SeasonAction } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const handleSeasonAction = async () => {
    if (!actionConfirm) return;
    setActionLoading(true);
    try {
      const { id, action } = actionConfirm;
      if (action === "delete") {
        await supabase.from("rounds").delete().eq("season_id", id);
        const { error } = await supabase.from("seasons").delete().eq("id", id);
        if (error) throw error;
        toast.success("Temporada excluída");
      } else {
        const statusMap: Record<string, string> = { deactivate: "inactive", activate: "active", finish: "finished" };
        const { error } = await supabase.from("seasons").update({ status: statusMap[action] }).eq("id", id);
        if (error) throw error;
        toast.success(action === "deactivate" ? "Temporada desativada" : action === "activate" ? "Temporada reativada" : "Temporada concluída");
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
            <SeasonCard
              key={s.id}
              season={s}
              groupId={groupId}
              isAdmin={isAdmin}
              menuOpen={menuOpenId === s.id}
              onToggleMenu={() => setMenuOpenId(menuOpenId === s.id ? null : s.id)}
              onAction={(action) => { setActionConfirm({ id: s.id, action }); setMenuOpenId(null); }}
            />
          ))
        )}
      </div>

      {actionConfirm && (
        <SeasonActionDialog
          action={actionConfirm.action}
          loading={actionLoading}
          onConfirm={handleSeasonAction}
          onCancel={() => setActionConfirm(null)}
        />
      )}

      {showCreate && (
        <CreateSeasonWizard
          groupId={groupId}
          onClose={() => setShowCreate(false)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
