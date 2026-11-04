import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ScoreStepper({ value, label, disabled, onChange }: {
  value: string;
  label: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const score = Number(value) || 0;
  return (
    <div className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center rounded-lg border border-border bg-background">
      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 touch-manipulation rounded-lg" disabled={disabled || score === 0} aria-label={`Diminuir ${label}`} title={`Diminuir ${label}`} onClick={() => onChange(String(score - 1))}>
        <Minus />
      </Button>
      <output aria-label={label} aria-live="polite" className="text-center font-display text-xl font-bold tabular-nums text-foreground">{score}</output>
      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 touch-manipulation rounded-lg text-primary" disabled={disabled || score >= 99} aria-label={`Aumentar ${label}`} title={`Aumentar ${label}`} onClick={() => onChange(String(score + 1))}>
        <Plus />
      </Button>
    </div>
  );
}