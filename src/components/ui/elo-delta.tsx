import { cn } from "@/lib/utils";

interface EloDeltaProps {
  /** Raw elo change. Positive = green, negative = red, zero = muted. */
  value: number | null | undefined;
  /** Optional unit suffix (e.g. "pts"). */
  suffix?: string;
  /** Visual size. */
  size?: "xs" | "sm" | "md";
  /** Render as a pill (with bg) or inline text. */
  variant?: "inline" | "pill";
  className?: string;
}

/**
 * Standardized Elo delta indicator.
 * - Always green for positive, red for negative, muted for zero/null.
 * - Always shows explicit sign (+/-).
 * - Uses tabular numbers so deltas align in columns.
 */
export function EloDelta({
  value,
  suffix,
  size = "sm",
  variant = "inline",
  className,
}: EloDeltaProps) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className={cn("text-muted-foreground tabular-nums", className)}>—</span>
    );
  }
  const rounded = Math.round(value);
  const tone =
    rounded > 0
      ? "text-success"
      : rounded < 0
        ? "text-destructive"
        : "text-muted-foreground";
  const pillTone =
    rounded > 0
      ? "bg-success/12 text-success ring-1 ring-success/25"
      : rounded < 0
        ? "bg-destructive/12 text-destructive ring-1 ring-destructive/25"
        : "bg-muted text-muted-foreground ring-1 ring-border";

  const sizeCls =
    size === "md"
      ? "text-sm"
      : size === "sm"
        ? "text-xs"
        : "text-[10px]";

  const sign = rounded > 0 ? "+" : "";
  const text = `${sign}${rounded}${suffix ? ` ${suffix}` : ""}`;

  if (variant === "pill") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-1.5 py-0.5 font-semibold tabular-nums leading-none",
          sizeCls,
          pillTone,
          className,
        )}
      >
        {text}
      </span>
    );
  }
  return (
    <span className={cn("font-semibold tabular-nums", sizeCls, tone, className)}>
      {text}
    </span>
  );
}
