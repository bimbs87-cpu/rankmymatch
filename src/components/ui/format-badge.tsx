import { cn } from "@/lib/utils";

export type FormatBadgeKind = "duel" | "league" | "casual" | "doubles" | "singles";

export interface FormatBadgeInfo {
  label: string;
  kind: FormatBadgeKind;
}

/**
 * Resolve the format badge for a group / round / match-like object.
 * Used everywhere to keep the visual meaning consistent.
 */
export function resolveFormatBadge(input: {
  match_format: string;
  singles_group_type?: string | null;
}): FormatBadgeInfo {
  if (input.match_format === "singles") {
    if (input.singles_group_type === "rivalry") return { label: "Duelo", kind: "duel" };
    if (input.singles_group_type === "league") return { label: "Liga", kind: "league" };
    if (input.singles_group_type === "casual") return { label: "Casual", kind: "casual" };
    return { label: "1x1", kind: "singles" };
  }
  return { label: "2x2", kind: "doubles" };
}

const KIND_CLASSES: Record<FormatBadgeKind, string> = {
  duel: "bg-primary/15 text-primary ring-1 ring-primary/30",
  league: "bg-info/15 text-info ring-1 ring-info/30",
  casual: "bg-muted text-muted-foreground ring-1 ring-border",
  doubles: "bg-success/15 text-success ring-1 ring-success/30",
  singles: "bg-muted text-muted-foreground ring-1 ring-border",
};

interface FormatBadgeProps {
  /** Pre-resolved info, OR pass `match_format` + `singles_group_type` and we resolve it. */
  info?: FormatBadgeInfo;
  match_format?: string;
  singles_group_type?: string | null;
  size?: "xs" | "sm";
  className?: string;
}

export function FormatBadge({
  info,
  match_format,
  singles_group_type,
  size = "xs",
  className,
}: FormatBadgeProps) {
  const resolved =
    info ?? (match_format ? resolveFormatBadge({ match_format, singles_group_type }) : null);
  if (!resolved) return null;
  const sizeCls =
    size === "sm"
      ? "px-2 py-0.5 text-[10px]"
      : "px-1.5 py-0.5 text-[9px]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-bold uppercase tracking-wider",
        sizeCls,
        KIND_CLASSES[resolved.kind],
        className,
      )}
    >
      {resolved.label}
    </span>
  );
}
