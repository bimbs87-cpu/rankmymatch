/**
 * Payment provider abstraction for premium subscription renewal.
 *
 * The actual provider (Stripe or Paddle) will be confirmed later. This file
 * exposes a single `startRenewalCheckout({ groupId, groupName })` entrypoint
 * so UI code can already call it. When the provider is set, only the
 * implementation below needs to change — call sites stay the same.
 */
import { toast } from "sonner";

export type RenewalProvider = "stripe" | "paddle" | "pending";

/** Switch this once the provider is decided. */
export const RENEWAL_PROVIDER: RenewalProvider = "pending";

export interface RenewalCheckoutOptions {
  groupId: string;
  groupName: string;
  /** Optional: planId hint when we have multiple SKUs. */
  planId?: string;
}

/**
 * Open the renewal checkout flow for the given group.
 * Falls back to /sistema#planos while provider is "pending".
 */
export async function startRenewalCheckout(opts: RenewalCheckoutOptions): Promise<void> {
  switch (RENEWAL_PROVIDER) {
    case "stripe":
      // TODO: call server fn that creates a Stripe Checkout session for this group
      // and redirect to session.url. Example shape:
      // const { url } = await createStripeRenewalSession({ groupId, planId });
      // window.location.href = url;
      return fallbackToPlansPage(opts);

    case "paddle":
      // TODO: open Paddle.Checkout.open({ items: [...], customData: { groupId } })
      // after loading Paddle.js. Until then, fallback.
      return fallbackToPlansPage(opts);

    case "pending":
    default:
      return fallbackToPlansPage(opts);
  }
}

function fallbackToPlansPage({ groupName }: RenewalCheckoutOptions) {
  toast.info("Abrindo página de planos…", {
    description: `Renovação de "${groupName}"`,
  });
  // small delay so the toast is visible
  setTimeout(() => {
    window.location.href = "/sistema#planos";
  }, 250);
}

/** Pre-filled WhatsApp link for the sales team. */
export function salesWhatsAppUrl(groupName: string): string {
  return `https://wa.me/?text=${encodeURIComponent(
    `Olá! Quero renovar a assinatura PREMIUM do grupo "${groupName}".`,
  )}`;
}
