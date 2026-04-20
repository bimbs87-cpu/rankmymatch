import { Bell, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  PUSH_EVENT_TYPES,
  usePushPreferences,
} from "@/hooks/use-push-preferences";
import { usePushSubscription } from "@/hooks/use-push-subscription";

const ROUND_SOUND_KEY = "rmm.roundAlertSound";

/**
 * Per-event push preferences. Lives on /profile.
 * Hidden when the device doesn't support push at all.
 * Toggles are disabled (but visible) when the user hasn't subscribed yet —
 * we explain why and link them back to PushOptInCard.
 *
 * Also exposes a local-only "round alert sound" toggle. When off, the
 * imminent-round countdown still vibrates but doesn't beep.
 */
export function PushPreferencesCard() {
  const { isEnabled, toggle, loading } = usePushPreferences();
  const { supported, isSubscribed, status } = usePushSubscription();
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    setSoundOn(localStorage.getItem(ROUND_SOUND_KEY) !== "off");
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(ROUND_SOUND_KEY, next ? "on" : "off");
    } catch {
      // ignore storage errors
    }
  }

  if (!supported) return null;
  const blocked = !isSubscribed || status !== "granted";

  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15">
          <Bell className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-sm font-bold text-foreground">
            Preferências de push
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Escolha o que receber no celular.
          </p>
        </div>
      </div>

      {blocked && (
        <div className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
          Ative o push neste dispositivo (no card acima) para que estas opções
          tenham efeito.
        </div>
      )}

      <ul className="divide-y divide-border/60">
        {PUSH_EVENT_TYPES.map((evt) => {
          const on = isEnabled(evt.key);
          return (
            <li key={evt.key} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {evt.label}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {evt.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(evt.key, !on)}
                disabled={loading}
                aria-pressed={on}
                aria-label={`${on ? "Desativar" : "Ativar"} ${evt.label}`}
                className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                  on ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${
                    on ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </li>
          );
        })}

        {/* Local-only: round-alert sound. Vibration is independent and stays on. */}
        <li className="flex items-start gap-3 py-3">
          <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-muted">
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Som de alerta da rodada
            </p>
            <p className="text-[11px] text-muted-foreground">
              Toca um beep curto quando o contador da próxima rodada chega em
              "começa agora". A vibração continua ativa.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={`${soundOn ? "Desativar" : "Ativar"} som de alerta da rodada`}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              soundOn ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${
                soundOn ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </li>
      </ul>
    </div>
  );
}
