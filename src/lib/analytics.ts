// Google Analytics 4 + Google Ads tracking helpers.
// Os scripts SÓ carregam após consentimento explícito (ver privacy-consent.ts).
// Nenhum evento é enviado sem consentimento.

const GA4_ID = "G-HDEGEPMC1K";
const ADS_ID = "AW-18099845561";

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
  if (gtagLoadRequested || getGtag()) return;
  gtagLoadRequested = true;

  const w = window as unknown as { dataLayer?: unknown[]; gtag?: GtagFn };
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params -- gtag.js precisa do objeto arguments
    w.dataLayer!.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", GA4_ID);
  w.gtag("config", ADS_ID, { allow_ad_personalization_signals: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  document.head.appendChild(script);
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

function canTrack(): boolean {
  return getGtag() !== null;
}

/**
 * Track a SPA pageview. Called automatically on route change.
 */
export function trackPageview(path: string, title?: string) {
  const gtag = getGtag();
  if (!gtag) return;
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
  const gtag = getGtag();
  if (!gtag) return;
  gtag("event", name, { ...params, send_to: GA4_ID });
}

/**
 * Track a Google Ads conversion event.
 * Pass the Ads conversion label (e.g. "abc123XYZ") if configured; otherwise
 * the event still fires to the Ads property for later remarketing/audiences.
 */
export function trackAdsConversion(label?: string, params: Record<string, unknown> = {}) {
  const gtag = getGtag();
  if (!gtag) return;
  const sendTo = label ? `${ADS_ID}/${label}` : ADS_ID;
  gtag("event", "conversion", { send_to: sendTo, ...params });
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
