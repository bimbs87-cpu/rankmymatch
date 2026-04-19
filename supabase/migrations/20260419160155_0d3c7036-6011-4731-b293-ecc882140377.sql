-- Track when we last sent a pending-requests reminder push to a given admin,
-- so the cron job doesn't spam them more than once every 24h.
CREATE TABLE IF NOT EXISTS public.admin_pending_reminder_log (
  user_id uuid PRIMARY KEY,
  last_reminded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_pending_reminder_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own reminder log entry (rare debug case)
CREATE POLICY "Users view own reminder log"
ON public.admin_pending_reminder_log
FOR SELECT
USING (auth.uid() = user_id);
-- Inserts/updates only happen via service role from the cron hook (no client policy).