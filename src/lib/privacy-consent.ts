// Consentimento para tecnologias não essenciais (Google Analytics / Google Ads).
// Escolha persistida em localStorage (anônimos) e na tabela privacy_consents
// (usuários logados), com versão do aviso para evidência.
import { supabase } from "@/integrations/supabase/client";

export const PRIVACY_NOTICE_VERSION = "2026-11-02";

export type ConsentChoice = "granted" | "denied";

const STORAGE_KEY = "rmm-privacy-consent-v1";

type Listener = (choice: ConsentChoice) => void;
const listeners = new Set<Listener>();

interface StoredConsent {
  choice: ConsentChoice;
  at: string;
  version: string;
}

export function getConsentChoice(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    return parsed.choice === "granted" || parsed.choice === "denied"
      ? parsed.choice
      : null;
  } catch {
    return null;
  }
}

export function hasTrackingConsent(): boolean {
  return getConsentChoice() === "granted";
}

export function setConsentChoice(choice: ConsentChoice, userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const record: StoredConsent = {
      choice,
      at: new Date().toISOString(),
      version: PRIVACY_NOTICE_VERSION,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* no-op */
  }
  listeners.forEach((cb) => cb(choice));

  // Evidência no banco para usuários autenticados (melhor esforço).
  if (userId) {
    void supabase
      .from("privacy_consents")
      .upsert(
        {
          user_id: userId,
          choice,
          notice_version: PRIVACY_NOTICE_VERSION,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .then(({ error }) => {
        if (error) console.error("[consent] persist failed:", error);
      });
  }
}

export function onConsentChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
