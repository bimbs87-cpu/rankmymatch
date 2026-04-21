-- 1. Add deletion-tracking fields to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_for timestamptz;

CREATE INDEX IF NOT EXISTS idx_user_profiles_deletion_scheduled
  ON public.user_profiles (deletion_scheduled_for)
  WHERE deletion_scheduled_for IS NOT NULL;

-- 2. Audit table for deletion requests
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | cancelled | executed
  cancelled_at timestamptz,
  executed_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own deletion requests"
  ON public.account_deletion_requests
  FOR SELECT
  USING (auth.uid() = user_id);

-- (No INSERT/UPDATE/DELETE policies — only server functions with service role can write.)

CREATE INDEX IF NOT EXISTS idx_deletion_requests_user
  ON public.account_deletion_requests (user_id, status);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_scheduled
  ON public.account_deletion_requests (scheduled_for)
  WHERE status = 'pending';

-- 3. Helper function: list users whose pending deletion has matured.
CREATE OR REPLACE FUNCTION public.get_due_deletions()
RETURNS TABLE (user_id uuid, scheduled_for timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, deletion_scheduled_for
  FROM public.user_profiles
  WHERE deletion_scheduled_for IS NOT NULL
    AND deletion_scheduled_for <= now()
    AND is_placeholder = false;
$$;