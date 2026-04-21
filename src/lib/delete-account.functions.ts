import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRACE_PERIOD_DAYS = 7;

/**
 * Requests account deletion with a 7-day grace period.
 *
 * Strategy (LGPD-compliant):
 * - Marks the user_profile with deletion_requested_at and deletion_scheduled_for.
 * - Creates a row in account_deletion_requests for audit.
 * - Creates an in-app notification confirming the request.
 * - The user remains fully functional during the grace period and can cancel.
 * - A daily cron (`process-pending-deletions`) executes the actual deletion
 *   once the scheduled date is reached.
 */
export const requestAccountDeletionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    const userEmail = claims?.email as string | undefined;
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    // Check if already pending
    const { data: existing } = await supabaseAdmin
      .from("user_profiles")
      .select("deletion_scheduled_for, name")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.deletion_scheduled_for) {
      throw new Error("Sua conta já tem uma exclusão agendada");
    }

    const { error: profileErr } = await supabaseAdmin
      .from("user_profiles")
      .update({
        deletion_requested_at: now.toISOString(),
        deletion_scheduled_for: scheduledFor.toISOString(),
      })
      .eq("user_id", userId);

    if (profileErr) {
      console.error("[request-deletion] update profile failed:", profileErr);
      throw new Error("Não foi possível agendar a exclusão");
    }

    await supabaseAdmin.from("account_deletion_requests").insert({
      user_id: userId,
      requested_at: now.toISOString(),
      scheduled_for: scheduledFor.toISOString(),
      status: "pending",
    });

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: "account_deletion_requested",
      title: "Exclusão de conta agendada",
      body: `Sua conta será excluída definitivamente em ${scheduledFor.toLocaleDateString("pt-BR")}. Você pode cancelar a qualquer momento até essa data nas configurações do perfil.`,
      data: { scheduled_for: scheduledFor.toISOString() },
    });

    // Send confirmation email (best-effort — failure does not block the request).
    if (userEmail) {
      try {
        await sendDeletionEmail({
          recipientEmail: userEmail,
          name: existing?.name ?? null,
          scheduledFor: scheduledFor.toISOString(),
          userId,
        });
      } catch (emailErr) {
        console.error("[request-deletion] email send failed:", emailErr);
      }
    }

    return { success: true, scheduledFor: scheduledFor.toISOString() };
  });

/**
 * Server-side helper that enqueues the deletion-confirmation email by
 * calling the project's transactional send route with service-role auth.
 */
async function sendDeletionEmail(params: {
  recipientEmail: string;
  name: string | null;
  scheduledFor: string;
  userId: string;
}) {
  const baseUrl = process.env.SITE_URL || "https://rankmymatch.app";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn("[request-deletion] SUPABASE_SERVICE_ROLE_KEY missing; skipping email");
    return;
  }
  const res = await fetch(`${baseUrl}/lovable/email/transactional/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      templateName: "account-deletion-requested",
      recipientEmail: params.recipientEmail,
      idempotencyKey: `account-deletion-${params.userId}-${params.scheduledFor}`,
      templateData: {
        name: params.name ?? undefined,
        scheduledFor: params.scheduledFor,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status}): ${body}`);
  }
}

/**
 * Cancels a pending account deletion (only works during the grace period).
 */
export const cancelAccountDeletionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("deletion_scheduled_for")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile?.deletion_scheduled_for) {
      throw new Error("Não há exclusão agendada");
    }

    if (new Date(profile.deletion_scheduled_for) <= new Date()) {
      throw new Error("O prazo de cancelamento já expirou");
    }

    const { error } = await supabaseAdmin
      .from("user_profiles")
      .update({
        deletion_requested_at: null,
        deletion_scheduled_for: null,
      })
      .eq("user_id", userId);

    if (error) {
      console.error("[cancel-deletion] update profile failed:", error);
      throw new Error("Não foi possível cancelar");
    }

    await supabaseAdmin
      .from("account_deletion_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "pending");

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: "account_deletion_cancelled",
      title: "Exclusão cancelada",
      body: "A exclusão da sua conta foi cancelada com sucesso. Sua conta continua ativa.",
    });

    return { success: true };
  });

/**
 * Returns the current deletion status for the authenticated user.
 */
export const getDeletionStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data } = await supabaseAdmin
      .from("user_profiles")
      .select("deletion_requested_at, deletion_scheduled_for")
      .eq("user_id", userId)
      .maybeSingle();

    return {
      pending: !!data?.deletion_scheduled_for,
      requestedAt: data?.deletion_requested_at ?? null,
      scheduledFor: data?.deletion_scheduled_for ?? null,
    };
  });
