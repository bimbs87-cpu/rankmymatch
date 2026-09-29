import { Info } from "lucide-react";

export function eligibilityMinimum(totalSets: number, percentage: number) {
  return totalSets > 0 ? Math.max(1, Math.floor(totalSets * percentage / 100)) : 0;
}

export function EligibilityNotice({ played, minimum, totalSets, completed, remaining, percentage, className = "" }: {
  played: number;
  minimum: number;
  totalSets: number;
  completed: number;
  remaining: number;
  percentage: number;
  className?: string;
}) {
  if (minimum === 0 || played >= minimum) return null;
  const missing = minimum - played;
  return (
    <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground ${className}`}>
      <Info className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
      <span>
        Fora da classificação por enquanto: o mínimo é calculado sobre {percentage}% dos sets da temporada, arredondado para baixo.
        {` Dos ${totalSets} sets registrados, você precisa jogar ${minimum} ou mais. Jogou ${played}; faltam ${missing}. ${completed} ${completed === 1 ? "rodada concluída" : "rodadas concluídas"} · ${remaining} ${remaining === 1 ? "rodada restante" : "rodadas restantes"}.`}
      </span>
    </p>
  );
}