// Emite eventos de onboarding para medir o funil pós-signup.
// Idempotente — cada (user_id, step) pode existir uma vez (unique index).
import { supabase } from "@/integrations/supabase/client";

export type OnboardingStep =
  | "signup"
  | "profile_completed"
  | "joined_first_group"
  | "created_first_group"
  | "first_match"
  | "first_match_result";

const SESSION_CACHE_KEY = "rmm-onb-emitted";

function getCache(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveCache(set: Set<string>) {
  try {
    window.sessionStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify(Array.from(set)),
    );
  } catch {
    // ignore
  }
}

/** Marca uma etapa do onboarding. Silencioso e idempotente. */
export async function trackOnboardingStep(
  step: OnboardingStep,
  metadata?: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const cacheKey = `${user.id}:${step}`;
    const cache = getCache();
    if (cache.has(cacheKey)) return;
    cache.add(cacheKey);
    saveCache(cache);

    // upsert ignora duplicatas via unique index (user_id, step)
    await supabase.from("onboarding_events").insert({
      user_id: user.id,
      step,
      metadata: metadata ?? null,
    });
  } catch {
    // silencioso
  }
}
