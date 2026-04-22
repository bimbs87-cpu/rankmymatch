// Rastreia TODAS as visitas ao site (incluindo anônimas) na tabela `page_visits`.
// Uma "visita" = pageview. Sessão é mantida em sessionStorage (1 sessão por aba/janela).
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "rmm-visit-session-id";
const FIRST_VISIT_KEY = "rmm-first-visit-done";
const LAST_PATH_KEY = "rmm-last-tracked-path";
const LAST_PATH_TS_KEY = "rmm-last-tracked-ts";

function getOrCreateSessionId(): string {
  try {
    let sid = window.sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid =
        (crypto?.randomUUID?.() as string) ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return `${Date.now()}`;
  }
}

function detectDeviceType(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (/mobile|iphone|ipod|android.*mobile/.test(ua)) return "mobile";
  if (/ipad|tablet|android(?!.*mobile)/.test(ua)) return "tablet";
  return "desktop";
}

function getReferrerHost(): string | null {
  try {
    if (!document.referrer) return null;
    const url = new URL(document.referrer);
    if (url.hostname === window.location.hostname) return null;
    return url.hostname;
  } catch {
    return null;
  }
}

/** Rotas internas/admin que NÃO devem ser rastreadas (não confundir métricas). */
const IGNORED_PATH_PREFIXES = [
  "/dev",
  "/admin",
  "/sobre-desenvolvimento",
  "/api/",
  "/lovable/",
];

function shouldIgnorePath(path: string): boolean {
  return IGNORED_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p));
}

/** Registra uma visita à página atual. Idempotente por (path) num intervalo curto. */
export async function trackPageVisit(path: string) {
  if (typeof window === "undefined") return;
  if (shouldIgnorePath(path)) return;
  try {
    // Evita duplicar a mesma rota chamada repetidas vezes em <2s (StrictMode etc.)
    const lastPath = window.sessionStorage.getItem(LAST_PATH_KEY);
    const lastTs = Number(window.sessionStorage.getItem(LAST_PATH_TS_KEY) ?? 0);
    if (lastPath === path && Date.now() - lastTs < 2000) return;
    window.sessionStorage.setItem(LAST_PATH_KEY, path);
    window.sessionStorage.setItem(LAST_PATH_TS_KEY, String(Date.now()));

    const sessionId = getOrCreateSessionId();
    const isFirstVisit = !window.localStorage.getItem(FIRST_VISIT_KEY);
    if (isFirstVisit) window.localStorage.setItem(FIRST_VISIT_KEY, "1");

    const url = new URL(window.location.href);
    const params = url.searchParams;

    let invite_code: string | null = null;
    const m = url.pathname.match(/^\/invite\/([^/?#]+)/);
    if (m) invite_code = m[1];

    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from("page_visits").insert({
      session_id: sessionId,
      user_id: user?.id ?? null,
      path,
      referrer_host: getReferrerHost(),
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      invite_code,
      user_agent: navigator.userAgent.slice(0, 255),
      is_first_visit: isFirstVisit,
      device_type: detectDeviceType(),
    });
  } catch {
    // silencioso — não quebra UX
  }
}
