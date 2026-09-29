import { Info } from "lucide-react";

export function eligibilityMinimum(totalSets: number, percentage: number) {
  return totalSets > 0 ? Math.max(1, Math.floor(totalSets * percentage / 100)) : 0;
}

export function EligibilityNotice({ minimum, totalSets, percentage, className = "" }: {
  minimum: number;
  totalSets: number;
  percentage: number;
  className?: string;
}) {
  return (
    <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground ${className}`}>
      <Info className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
      <span>
        O mínimo para pontuar é {percentage}% dos sets da temporada, arredondado para baixo. Dos {totalSets} sets registrados, é preciso jogar {minimum} ou mais.
      </span>
    </p>
  );
}

export function EligibilityProgress({ played, totalSets }: { played: number; totalSets: number }) {
  const percentage = totalSets > 0 ? Math.floor(played / totalSets * 100) : 0;
  return <span>{played} {played === 1 ? "set" : "sets"} / {percentage}%</span>;
}