import { supabase } from '@/integrations/supabase/client'

interface SendTransactionalEmailParams {
  templateName: string
  recipientEmail: string
  idempotencyKey?: string
  templateData?: Record<string, any>
}

/**
 * Sends a transactional email via the Lovable email infrastructure.
 * Authenticated client-side trigger — uses the current user's session JWT.
 */
export async function sendTransactionalEmail(params: SendTransactionalEmailParams) {
  const { data: { session } } = await supabase.auth.getSession()
  const response = await fetch('/lovable/email/transactional/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      templateName: params.templateName,
      recipientEmail: params.recipientEmail,
      idempotencyKey: params.idempotencyKey,
      templateData: params.templateData,
    }),
  })
  if (!response.ok) {
    throw new Error(`Failed to send email: ${response.statusText}`)
  }
  return response.json()
}
