/**
 * Local-only round alert: short beep + vibration when a match is about to start.
 * The beep can be muted via the "rmm.roundAlertSound" localStorage key —
 * vibration always plays (it's the silent channel for users with sound off).
 */

export const ROUND_SOUND_KEY = "rmm.roundAlertSound";

export function isRoundSoundEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(ROUND_SOUND_KEY) !== "off";
}

export function setRoundSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(ROUND_SOUND_KEY, on ? "on" : "off");
  } catch {
    // ignore storage errors
  }
}

/**
 * Plays a short, soft beep using the Web Audio API.
 * Returns true if a sound was attempted, false if blocked or unsupported.
 */
export function playRoundBeep(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    o.start(now);
    o.stop(now + 0.5);
    setTimeout(() => ctx.close().catch(() => {}), 700);
    return true;
  } catch {
    return false;
  }
}

export function vibrateRoundAlert(): void {
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    // ignore
  }
}

/**
 * Full round alert — vibration + (optional) beep based on user preference.
 */
export function playRoundAlert(): void {
  vibrateRoundAlert();
  if (isRoundSoundEnabled()) {
    playRoundBeep();
  }
}
