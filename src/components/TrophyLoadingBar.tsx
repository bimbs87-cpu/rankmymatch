import { useEffect, useState } from "react";
import racketNeon from "@/assets/logo-symbol-neon.png";
import racketBlack from "@/assets/logo-symbol-black.png";

interface TrophyLoadingBarProps {
  /** 0–100. If omitted, an indeterminate animation plays. */
  progress?: number;
  /** Optional label below the bar */
  label?: string;
  /** Render as full-screen centered (default) or inline */
  fullScreen?: boolean;
  /** Smaller variant for inline sections */
  compact?: boolean;
}

/**
 * Premium loading indicator for RankMyMatch.
 *
 * Design rationale:
 * - The brand racket is the hero — a single, large, gently floating mark sets
 *   the tone (sport + premium) without visual noise.
 * - A soft radial glow behind the racket provides depth without competing
 *   with the icon.
 * - The bar is a thin track with a glossy highlight sweep — quieter than the
 *   old "stars + chunky bar" combination but feels more refined.
 * - Reduced motion: respects `prefers-reduced-motion` automatically through
 *   tailwind's motion-safe utilities.
 */
export function TrophyLoadingBar({
  progress,
  label,
  fullScreen = true,
  compact = false,
}: TrophyLoadingBarProps) {
  const isIndeterminate = progress === undefined;
  const displayProgress = isIndeterminate ? 0 : Math.max(0, Math.min(100, Math.round(progress)));

  // Smoothly animate the determinate value so the fill never "jumps".
  const [animatedValue, setAnimatedValue] = useState(displayProgress);
  useEffect(() => {
    if (isIndeterminate) return;
    const id = requestAnimationFrame(() => setAnimatedValue(displayProgress));
    return () => cancelAnimationFrame(id);
  }, [displayProgress, isIndeterminate]);

  const iconSize = compact ? "h-20 w-20" : "h-28 w-28";
  const glowSize = compact ? "h-32 w-32" : "h-44 w-44";
  const barHeight = compact ? "h-1.5" : "h-2";
  const trackWidth = compact ? "w-48" : "w-64";

  const content = (
    <div className="flex flex-col items-center gap-6">
      {/* Racket with ambient glow + gentle float */}
      <div className="relative flex items-center justify-center">
        {/* Soft radial glow — uses theme primary, fades out */}
        <div
          className={`absolute ${glowSize} rounded-full bg-primary/20 blur-2xl motion-safe:animate-pulse`}
          aria-hidden="true"
        />
        <div
          className={`absolute ${glowSize} rounded-full bg-primary/10 blur-3xl`}
          aria-hidden="true"
        />

        {/* Subtle rotating ring of dots — quiet, brand-aligned */}
        <div
          className={`absolute ${glowSize} motion-safe:animate-[spin_8s_linear_infinite]`}
          aria-hidden="true"
        >
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <span
              key={deg}
              className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/40"
              style={{
                transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-${compact ? 44 : 60}px)`,
              }}
            />
          ))}
        </div>

        {/* Racket icon — neon on dark, black on light. Floats gently. */}
        <div className="relative motion-safe:animate-[float_2.6s_ease-in-out_infinite]">
          <img
            src={racketNeon}
            alt=""
            aria-hidden="true"
            draggable={false}
            className={`hidden ${iconSize} select-none object-contain drop-shadow-[0_0_18px_var(--primary)] dark:block`}
          />
          <img
            src={racketBlack}
            alt=""
            aria-hidden="true"
            draggable={false}
            className={`block ${iconSize} select-none object-contain dark:hidden`}
          />
        </div>
      </div>

      {/* Slim progress track with a moving highlight (shimmer) */}
      <div className={`${trackWidth} flex flex-col items-center gap-2`}>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={isIndeterminate ? undefined : displayProgress}
          aria-label={label || "Carregando"}
          className={`relative w-full overflow-hidden rounded-full bg-muted ${barHeight}`}
        >
          {isIndeterminate ? (
            <>
              {/* Subtle base tint so the track never looks empty */}
              <span className="absolute inset-0 bg-primary/10" />
              {/* Sweeping highlight — the only motion on the bar */}
              <span
                className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent motion-safe:animate-[loadingSweep_1.4s_ease-in-out_infinite]"
                aria-hidden="true"
              />
            </>
          ) : (
            <>
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/80 to-primary transition-[width] duration-500 ease-out"
                style={{ width: `${animatedValue}%` }}
              />
              {/* Glossy specular highlight on top of fill */}
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-b from-white/30 to-transparent transition-[width] duration-500 ease-out"
                style={{ width: `${animatedValue}%` }}
                aria-hidden="true"
              />
            </>
          )}
        </div>

        {/* Compact, monospace label — premium feel */}
        <div className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <span>{label || "Carregando"}</span>
          {!isIndeterminate && (
            <span className="tabular-nums text-foreground/70">{displayProgress}%</span>
          )}
          {isIndeterminate && (
            <span className="flex gap-1" aria-hidden="true">
              <span className="motion-safe:animate-[dotPulse_1.2s_ease-in-out_infinite] h-1 w-1 rounded-full bg-primary/70" />
              <span
                className="motion-safe:animate-[dotPulse_1.2s_ease-in-out_infinite] h-1 w-1 rounded-full bg-primary/70"
                style={{ animationDelay: "0.2s" }}
              />
              <span
                className="motion-safe:animate-[dotPulse_1.2s_ease-in-out_infinite] h-1 w-1 rounded-full bg-primary/70"
                style={{ animationDelay: "0.4s" }}
              />
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-8">
        {content}
      </div>
    );
  }

  return <div className="flex justify-center px-4 py-8">{content}</div>;
}
