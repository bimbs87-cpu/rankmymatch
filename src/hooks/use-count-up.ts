import { useEffect, useRef, useState } from "react";

/**
 * Animates a numeric value from a previous value to the current one.
 * - Only animates when `value` actually changes between renders (not on initial mount).
 * - Persists the last seen value per `storageKey` in localStorage so that
 *   navigating away and coming back doesn't re-trigger the animation.
 * - Duration is short (default 300ms) for a "rapid" tick.
 *
 * Returns the current displayed (animated) value.
 */
export function useCountUp(
  value: number | null | undefined,
  storageKey: string | null,
  durationMs: number = 300,
): number {
  const target = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState<number>(target);
  const fromRef = useRef<number>(target);
  const rafRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;

    // First mount with a real value: read previous from storage if available.
    if (!initializedRef.current) {
      initializedRef.current = true;
      let prev: number | null = null;
      if (storageKey && typeof window !== "undefined") {
        const raw = window.localStorage.getItem(storageKey);
        const parsed = raw ? Number(raw) : NaN;
        if (Number.isFinite(parsed)) prev = parsed;
      }
      if (prev !== null && Math.round(prev) !== Math.round(value)) {
        // Animate from previous → current
        fromRef.current = prev;
        setDisplay(prev);
        animateTo(value);
      } else {
        setDisplay(value);
      }
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, String(value));
      }
      return;
    }

    // Subsequent updates: animate only when value actually changes.
    if (Math.round(fromRef.current) !== Math.round(value)) {
      animateTo(value);
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, String(value));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, storageKey]);

  function animateTo(to: number) {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const from = fromRef.current;
    const delta = to - from;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Ease-out cubic for snappy feel
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + delta * eased;
      setDisplay(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return display;
}
