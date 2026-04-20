// Google Analytics 4 + Google Ads tracking helpers
// IDs configured in src/routes/__root.tsx

const GA4_ID = "G-HDEGEPMC1K";
const ADS_ID = "AW-18099845561";

type GtagFn = (...args: unknown[]) => void;

function getGtag(): GtagFn | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { gtag?: GtagFn };
  return typeof w.gtag === "function" ? w.gtag : null;
}

/**
 * Track a SPA pageview. Called automatically on route change.
 */
export function trackPageview(path: string, title?: string) {
  const gtag = getGtag();
  if (!gtag) return;
  gtag("event", "page_view", {
    page_path: path,
    page_location: typeof window !== "undefined" ? window.location.href : path,
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
