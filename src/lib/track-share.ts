/**
 * Lightweight share-event tracker.
 *
 * Records a row in `group_share_events` for analytics. Best-effort:
 * failures are swallowed (we never want a tracking issue to break a share).
 *
 * Channels:
 *  - copy     → user copied the share link
 *  - native   → triggered Web Share API
 *  - qr       → downloaded QR PNG
 *  - image    → copied QR/image to clipboard
 *  - whatsapp → opened a WhatsApp deep link
 *  - preview  → opened the share dialog (counted as an "intent")
 */
import { supabase } from "@/integrations/supabase/client";

export type ShareChannel = "copy" | "native" | "qr" | "image" | "whatsapp" | "preview";

export async function trackShareEvent(groupId: string, channel: ShareChannel): Promise<void> {
  if (!groupId) return;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id ?? null;
    await supabase.from("group_share_events").insert({
      group_id: groupId,
      user_id: userId,
      channel,
    });
  } catch {
    // Silent — analytics must never block a share UX
  }
}

/**
 * Returns the count of share events for a group within the last `days` days.
 * Defaults to 7 (this week).
 */
export async function getRecentShareCount(groupId: string, days = 7): Promise<number> {
  if (!groupId) return 0;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("group_share_events")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .gte("created_at", since);
  return count ?? 0;
}
