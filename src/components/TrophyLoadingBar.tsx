import { useRef, useEffect, useState } from "react";
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

export function TrophyLoadingBar({
  progress,
  label,
  fullScreen = true,
  compact = false,
}: TrophyLoadingBarProps) {
  const prevProgress = useRef(progress ?? 0);
  const [rotateY, setRotateY] = useState(0);
  const isIndeterminate = progress === undefined;
  const displayProgress = isIndeterminate ? undefined : Math.round(progress);

  // Track progress direction → trophy 3D rotation
  useEffect(() => {
    if (isIndeterminate) return;
    const delta = progress - prevProgress.current;
    // Map progress directly to rotation: full 360° over 0→100%
    setRotateY(progress * 3.6 * (delta >= 0 ? 1 : -1 ));
    prevProgress.current = progress;
  }, [progress, isIndeterminate]);

  // For indeterminate, oscillate rotation
  const [indeterminateAngle, setIndeterminateAngle] = useState(0);
  useEffect(() => {
    if (!isIndeterminate) return;
    const interval = setInterval(() => {
      setIndeterminateAngle((prev) => prev + 8);
    }, 50);
    return () => clearInterval(interval);
  }, [isIndeterminate]);

  const trophyRotation = isIndeterminate ? indeterminateAngle : rotateY;
  const barHeight = compact ? 32 : 50;

  const content = (
    <div className="flex flex-col items-center gap-4 w-full max-w-xs mx-auto">
      {/* Trophy with stars */}
      <div className="relative flex items-center justify-center w-24 h-24">
        {/* Animated stars */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="absolute text-primary/60 text-[10px] animate-pulse"
            style={{
              top: `${12 + 20 * Math.sin((i * Math.PI) / 3 + (isIndeterminate ? indeterminateAngle * 0.02 : (progress ?? 0) * 0.06))}px`,
              left: `${12 + 20 * Math.cos((i * Math.PI) / 3 + (isIndeterminate ? indeterminateAngle * 0.02 : (progress ?? 0) * 0.06))}px`,
              animationDelay: `${i * 150}ms`,
              animationDuration: `${800 + i * 200}ms`,
            }}
          >
            ✦
          </span>
        ))}

        {/* Outer orbit stars */}
        {[0, 1, 2, 3].map((i) => (
          <span
            key={`outer-${i}`}
            className="absolute text-primary/30 text-xs"
            style={{
              top: `${48 + 38 * Math.sin((i * Math.PI) / 2 + (isIndeterminate ? indeterminateAngle * 0.015 : (progress ?? 0) * 0.04))}px`,
              left: `${48 + 38 * Math.cos((i * Math.PI) / 2 + (isIndeterminate ? indeterminateAngle * 0.015 : (progress ?? 0) * 0.04))}px`,
              transform: "translate(-50%, -50%)",
            }}
          >
            ★
          </span>
        ))}

        {/* Racket icon with 3D rotation — neon on dark, black on light */}
        <div
          className="transition-transform duration-500 ease-out"
          style={{
            transform: `perspective(200px) rotateY(${trophyRotation}deg)`,
            transformStyle: "preserve-3d",
          }}
        >
          <img
            src={racketNeon}
            alt=""
            aria-hidden="true"
            className="hidden h-10 w-10 object-contain drop-shadow-[0_0_12px_var(--primary)] dark:block"
          />
          <img
            src={racketBlack}
            alt=""
            aria-hidden="true"
            className="block h-10 w-10 object-contain dark:hidden"
          />
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full relative" style={{ height: barHeight }}>
        <div
          className="w-full overflow-hidden rounded-2xl bg-primary/10 border border-primary/20"
          style={{ height: barHeight }}
        >
          {isIndeterminate ? (
            <div
              className="h-full rounded-2xl bg-gradient-to-r from-primary/40 via-primary to-primary/40 animate-[indeterminate_1.5s_ease-in-out_infinite]"
              style={{ width: "40%" }}
            />
          ) : (
            <div
              className="h-full rounded-2xl bg-gradient-to-r from-primary to-primary/70 transition-all duration-500 ease-out"
              style={{ width: `${displayProgress}%` }}
            />
          )}
        </div>
        {/* Percentage text centered on the bar */}
        <div
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="font-display text-sm font-bold text-primary-foreground drop-shadow-sm mix-blend-difference">
            {isIndeterminate ? "Carregando…" : `${displayProgress}%`}
          </span>
        </div>
      </div>

      {/* Optional label */}
      {label && (
        <p className="text-center text-xs text-muted-foreground">{label}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-8">
        {content}
      </div>
    );
  }

  return (
    <div className="flex justify-center py-8 px-4">
      {content}
    </div>
  );
}
