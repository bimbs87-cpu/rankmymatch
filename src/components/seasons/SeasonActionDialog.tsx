import { Trash2, EyeOff, Eye, CheckCircle } from "lucide-react";
import type { SeasonAction } from "./SeasonCard";

interface Props {
  action: SeasonAction;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIG: Record<SeasonAction, { icon: typeof Trash2; iconColor: string; bgColor: string; btnColor: string; title: string; desc: string }> = {
  delete: {
    icon: Trash2,
    iconColor: "text-destructive",
    bgColor: "bg-destructive/10",
    btnColor: "bg-destructive",
    title: "Excluir temporada?",
    desc: "A temporada e todas as suas rodadas serão permanentemente excluídas. Considere desativar para apenas ocultar.",
  },
  deactivate: {
    icon: EyeOff,
    iconColor: "text-warning",
    bgColor: "bg-warning/10",
    btnColor: "bg-warning",
    title: "Desativar temporada?",
    desc: "A temporada ficará oculta para os membros. Você poderá reativá-la a qualquer momento.",
  },
  activate: {
    icon: Eye,
    iconColor: "text-success",
    bgColor: "bg-success/10",
    btnColor: "bg-primary",
    title: "Reativar temporada?",
    desc: "A temporada voltará a ser visível para todos os membros do grupo.",
  },
  finish: {
    icon: CheckCircle,
    iconColor: "text-success",
    bgColor: "bg-success/10",
    btnColor: "bg-primary",
    title: "Concluir temporada?",
    desc: "A temporada será marcada como encerrada. Os resultados serão mantidos.",
  },
};

export function SeasonActionDialog({ action, loading, onConfirm, onCancel }: Props) {
  const c = CONFIG[action];
  const Icon = c.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-[90%] max-w-sm rounded-3xl border border-border bg-card p-6 animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${c.bgColor}`}>
            <Icon className={`h-7 w-7 ${c.iconColor}`} />
          </div>
          <h3 className="font-display text-base font-bold text-foreground">{c.title}</h3>
          <p className="text-sm text-muted-foreground">{c.desc}</p>
          <div className="flex w-full gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 rounded-2xl py-3 text-sm font-bold text-primary-foreground disabled:opacity-50 ${c.btnColor}`}
            >
              {loading ? "Processando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
