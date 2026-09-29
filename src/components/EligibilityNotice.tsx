import { Info } from "lucide-react";

export function eligibilityMinimum(completedRounds: number, percentage: number) {
  return Math.ceil(completedRounds * percentage / 100);
}

export function EligibilityNotice({ played, minimum, completed, remaining, percentage, className = "" }: {
  played: number;
  minimum: number;
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
        Fora da classificação por enquanto: {played} de {minimum} partidas mínimas ({percentage}% das rodadas concluídas).
        {` Faltam ${missing} ${missing === 1 ? "partida" : "partidas"}. ${completed} ${completed === 1 ? "rodada concluída" : "rodadas concluídas"} · ${remaining} ${remaining === 1 ? "restante" : "restantes"} na temporada.`}
      </span>
    </p>
  );
}