interface WizardStep {
  key: string;
  label: string;
}

interface WizardStepperProps {
  steps: WizardStep[];
  currentStep: string;
  className?: string;
}

export function WizardStepper({ steps, currentStep, className }: WizardStepperProps) {
  const currentIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className={`flex items-center justify-center gap-2 ${className ?? ""}`}>
      {steps.map((s, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-0.5 w-6 rounded-full transition-colors duration-300 ${isDone ? "bg-primary" : "bg-border"}`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                  isActive
                    ? "bg-primary text-primary-foreground scale-110"
                    : isDone
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={`text-[10px] font-medium transition-colors duration-300 ${
                  isActive ? "text-primary" : isDone ? "text-primary/60" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
