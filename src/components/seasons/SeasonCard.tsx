import { Link } from "@tanstack/react-router";
import { Trophy, MoreVertical, Trash2, EyeOff, Eye, CheckCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Season = Tables<"seasons">;
export type SeasonAction = "delete" | "deactivate" | "finish" | "activate";

interface Props {
  season: Season;
  groupId: string;
  isAdmin: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onAction: (action: SeasonAction) => void;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  finished: "Encerrada",
  inactive: "Desativada",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-success",
  inactive: "bg-warning",
  finished: "bg-muted-foreground",
};

export function SeasonCard({ season: s, groupId, isAdmin, menuOpen, onToggleMenu, onAction }: Props) {
  return (
    <div
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
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status] || "bg-muted-foreground"}`} />
              <span className="capitalize">{STATUS_LABEL[s.status] || s.status}</span>
              {s.total_rounds && <span>• {s.total_rounds} rodadas</span>}
            </div>
          </div>
        </div>
      </Link>

      {isAdmin && (
        <div className="absolute right-2 top-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/30"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-10 w-44 rounded-xl border border-border bg-card shadow-lg py-1">
              {s.status === "active" && (
                <>
                  <button
                    onClick={() => onAction("finish")}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent/30"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-success" />
                    Concluir temporada
                  </button>
                  <button
                    onClick={() => onAction("deactivate")}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent/30"
                  >
                    <EyeOff className="h-3.5 w-3.5 text-warning" />
                    Desativar (ocultar)
                  </button>
                </>
              )}
              {s.status === "inactive" && (
                <button
                  onClick={() => onAction("activate")}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent/30"
                >
                  <Eye className="h-3.5 w-3.5 text-success" />
                  Reativar temporada
                </button>
              )}
              <button
                onClick={() => onAction("delete")}
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
  );
}
