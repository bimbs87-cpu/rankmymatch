// Captura UTM/invite_code/referrer no carregamento inicial e persiste em localStorage
// até o usuário se cadastrar — então grava em user_acquisition (uma vez por usuário).
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "rmm-acq-attribution";
const TRACKED_FLAG_PREFIX = "rmm-acq-saved-";

export type AcquisitionData = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  invite_code: string | null;
  referrer: string | null;
  landing_path: string | null;
  captured_at: string;
};

/** Captura atribuição na primeira visita (chamar no client logo no boot). */
export function captureAcquisitionOnce() {
  if (typeof window === "undefined") return;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    const url = new URL(window.location.href);
    const params = url.searchParams;

    const utm_source = params.get("utm_source");
    const utm_medium = params.get("utm_medium");
    const utm_campaign = params.get("utm_campaign");

    // Detecta invite code da rota /invite/:code
    let invite_code: string | null = null;
    const match = url.pathname.match(/^\/invite\/([^/?#]+)/);
    if (match) invite_code = match[1];

    // Se já existe attribution salva e não há nenhuma nova fonte, não sobrescreve
    const hasNewSignal = utm_source || utm_medium || utm_campaign || invite_code;
    if (existing && !hasNewSignal) return;

    const data: AcquisitionData = {
      utm_source: utm_source ?? null,
      utm_medium: utm_medium ?? null,
      utm_campaign: utm_campaign ?? null,
      invite_code,
      referrer: document.referrer ? new URL(document.referrer).hostname : null,
      landing_path: url.pathname,
      captured_at: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* no-op */
  }
}

/** Persiste a atribuição capturada no banco para um usuário recém-cadastrado. */
export async function saveAcquisitionForUser(userId: string) {
  if (typeof window === "undefined") return;
  try {
    const flagKey = `${TRACKED_FLAG_PREFIX}${userId}`;
    if (window.localStorage.getItem(flagKey)) return;

    const raw = window.localStorage.getItem(STORAGE_KEY);
    let data: Partial<AcquisitionData> = {};
    if (raw) {
      try {
        data = JSON.parse(raw) as AcquisitionData;
      } catch {
        /* ignore parse error */
      }
    }

    // Mesmo sem attribution capturada, grava linha vazia (= "direct")
    const { error } = await supabase.from("user_acquisition").insert({
      user_id: userId,
      utm_source: data.utm_source ?? null,
      utm_medium: data.utm_medium ?? null,
      utm_campaign: data.utm_campaign ?? null,
      invite_code: data.invite_code ?? null,
      referrer: data.referrer ?? null,
      landing_path: data.landing_path ?? null,
    });

    // Conflito de PK = já existe → ok
    if (error && !/duplicate key|conflict/i.test(error.message)) {
      console.error("[acquisition] insert error:", error);
      return;
    }

    window.localStorage.setItem(flagKey, "1");
  } catch (e) {
    console.error("[acquisition] saveAcquisitionForUser failed:", e);
  }
}

/** Registra uma sessão diária (idempotente por dia via UNIQUE constraint). */
export async function logUserSession(userId: string) {
  if (typeof window === "undefined") return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const flagKey = `rmm-session-logged-${userId}-${today}`;
    if (window.localStorage.getItem(flagKey)) return;

    const { error } = await supabase.from("user_sessions").insert({
      user_id: userId,
      session_date: today,
      user_agent: navigator.userAgent.slice(0, 255),
    });

    // Conflito = já registrado hoje → ok
    if (error && !/duplicate key|conflict|unique/i.test(error.message)) {
      console.error("[session] log error:", error);
      return;
    }
    window.localStorage.setItem(flagKey, "1");
  } catch (e) {
    console.error("[session] logUserSession failed:", e);
  }
}
