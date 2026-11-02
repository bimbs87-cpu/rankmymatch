// Google Analytics 4 + Google Ads tracking helpers.
// Os scripts SÓ carregam após consentimento explícito (ver privacy-consent.ts).
// Nenhum evento é enviado sem consentimento; ao revogar, a coleta para
// imediatamente (opt-out do GA4 + consent mode "denied" + remoção de cookies).
import { hasTrackingConsent } from "@/lib/privacy-consent";

const GA4_ID = "G-HDEGEPMC1K";
const ADS_ID = "AW-18099845561";

// Chave de opt-out oficial do GA4: quando true, o gtag não coleta nada.
const GA_DISABLE_KEY = `ga-disable-${GA4_ID}`;

type GtagFn = (...args: unknown[]) => void;

let gtagLoadRequested = false;

function getGtag(): GtagFn | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { gtag?: GtagFn };
  return typeof w.gtag === "function" ? w.gtag : null;
}

/**
 * Injeta o gtag.js e configura GA4 + Ads. Chamado apenas quando o usuário
 * aceitou medição opcional. Sinais de personalização de anúncios ficam
 * desativados até decisão explícita do proprietário.
 */
export function ensureGtagLoaded() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!hasTrackingConsent()) return;
  if (gtagLoadRequested || getGtag()) return;
  gtagLoadRequested = true;

  const w = window as unknown as {
    dataLayer?: unknown[];
    gtag?: GtagFn;
    [key: string]: unknown;
  };
  // Reautorização após revogação: limpa o opt-out antes de configurar.
  w[GA_DISABLE_KEY] = false;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params -- gtag.js precisa do objeto arguments
    w.dataLayer!.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("consent", "update", {
    analytics_storage: "granted",
    ad_storage: "granted",
  });
  w.gtag("config", GA4_ID);
  w.gtag("config", ADS_ID, { allow_ad_personalization_signals: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  document.head.appendChild(script);
}

/**
 * Revoga a medição opcional: para a coleta imediatamente, sem recarregar.
 * - Ativa o opt-out oficial do GA4 (nenhum hit novo é enviado);
 * - Atualiza o consent mode para "denied" (Ads/Analytics);
 * - Remove os cookies opcionais do Google (_ga, _ga_*, _gcl_*) deste domínio.
 * Dados já enviados antes da revogação seguem a política de retenção do Google.
 */
export function revokeTracking() {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  w[GA_DISABLE_KEY] = true;

  const gtag = getGtag();
  if (gtag) {
    gtag("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }

  if (typeof document === "undefined") return;
  const hostname = window.location.hostname;
  const cookies = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter(Boolean);
  for (const name of cookies) {
    if (name === "_ga" || name.startsWith("_ga_") || name.startsWith("_gcl")) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${hostname}`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${hostname}`;
    }
  }
}

/**
 * Remove dados sensíveis de caminhos antes de enviar a terceiros:
 * - query string e hash nunca são enviados (podem conter tokens/parâmetros);
 * - códigos de convite (/invite/<codigo>) são mascarados.
 */
export function sanitizePath(path: string): string {
  const noQuery = path.split("?")[0].split("#")[0];
  return noQuery.replace(/^\/invite\/[^/]+/, "/invite");
}

/**
 * Minimização de parâmetros personalizados: descarta chaves que possam
 * carregar informação pessoal, códigos de convite ou tokens. Defesa em
 * profundidade — os emissores já devem enviar apenas IDs internos e enums.
 */
const SENSITIVE_PARAM_KEY =
  /token|secret|password|passwd|email|e_mail|nome|name|phone|telefone|cpf|invite|code|codigo|auth|session|cookie/i;

export function scrubParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (SENSITIVE_PARAM_KEY.test(key)) continue;
    if (typeof value === "string" && value.length > 100) continue;
    clean[key] = value;
  }
  return clean;
}

function canTrack(): boolean {
  return getGtag() !== null && hasTrackingConsent();
}

/**
 * Track a SPA pageview. Called automatically on route change.
 */
export function trackPageview(path: string, title?: string) {
  if (!canTrack()) return;
  const gtag = getGtag()!;
  const safePath = sanitizePath(path);
  gtag("event", "page_view", {
    page_path: safePath,
    page_location:
      typeof window !== "undefined"
        ? `${window.location.origin}${safePath}`
        : safePath,
    page_title: title ?? (typeof document !== "undefined" ? document.title : undefined),
    send_to: GA4_ID,
  });
}

/**
 * Track a custom event to GA4.
 */
export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  if (!canTrack()) return;
  const gtag = getGtag()!;
  gtag("event", name, { ...scrubParams(params), send_to: GA4_ID });
}

/**
 * Track a Google Ads conversion event.
 * Pass the Ads conversion label (e.g. "abc123XYZ") if configured; otherwise
 * the event still fires to the Ads property for later remarketing/audiences.
 */
export function trackAdsConversion(label?: string, params: Record<string, unknown> = {}) {
  if (!canTrack()) return;
  const gtag = getGtag()!;
  const sendTo = label ? `${ADS_ID}/${label}` : ADS_ID;
  gtag("event", "conversion", { send_to: sendTo, ...scrubParams(params) });
}

/**
 * Convenience: track a key conversion to BOTH GA4 (as named event) and Google Ads.
 */
export function trackConversion(
  eventName: "sign_up" | "create_group" | "register_match",
  params: Record<string, unknown> = {},
  adsLabel?: string,
) {
  trackEvent(eventName, params);
  trackAdsConversion(adsLabel, params);
}

// canTrack é exportado para testes e diagnóstico.
export { canTrack };
