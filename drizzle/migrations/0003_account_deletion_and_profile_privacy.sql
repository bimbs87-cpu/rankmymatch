-- 1) Deletion request processing state
ALTER TABLE public.account_deletion_requests
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS completed_steps text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';

ALTER TABLE public.account_deletion_requests
  ADD CONSTRAINT account_deletion_requests_status_check
  CHECK (status IN ('pending','processing','failed','executed','cancelled'));

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_open_per_user
  ON public.account_deletion_requests(user_id)
  WHERE status IN ('pending','processing','failed');

-- Claim exactly one due request; SKIP LOCKED prevents two runners taking the same row.
CREATE OR REPLACE FUNCTION public.claim_next_account_deletion()
RETURNS TABLE(id uuid, user_id uuid, attempts integer, completed_steps text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.account_deletion_requests r
     SET status = 'processing', claimed_at = now(), attempts = r.attempts + 1
   WHERE r.id = (
     SELECT q.id FROM public.account_deletion_requests q
      WHERE q.scheduled_for <= now()
        AND q.attempts < 5
        AND (q.status = 'pending'
          OR (q.status = 'failed' AND q.claimed_at < now() - interval '15 minutes')
          OR (q.status = 'processing' AND q.claimed_at < now() - interval '30 minutes'))
      ORDER BY q.scheduled_for
      FOR UPDATE SKIP LOCKED
      LIMIT 1)
  RETURNING r.id, r.user_id, r.attempts, r.completed_steps;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_account_deletion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_account_deletion() TO service_role;

-- 2) Privileged functions: only server code may call them
REVOKE ALL ON FUNCTION public.get_due_deletions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_deletions() TO service_role;

-- Scheduler credential for the deletion processor (server-only, never readable by clients)
CREATE TABLE IF NOT EXISTS public.deletion_scheduler_credentials (
  id integer PRIMARY KEY CHECK (id = 1),
  token text NOT NULL
);
GRANT ALL ON public.deletion_scheduler_credentials TO service_role;
ALTER TABLE public.deletion_scheduler_credentials ENABLE ROW LEVEL SECURITY;
INSERT INTO public.deletion_scheduler_credentials(id, token)
VALUES (1, encode(extensions.gen_random_bytes(36), 'hex'))
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_deletion_scheduler_token(_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.deletion_scheduler_credentials
                 WHERE id = 1 AND length(_token) = 72 AND token = _token);
$$;
REVOKE ALL ON FUNCTION public.verify_deletion_scheduler_token(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_deletion_scheduler_token(text) TO anon, service_role;

-- 3) Profile privacy: column-level access. Personal fields only via authorized function.
REVOKE SELECT, UPDATE ON public.user_profiles FROM anon, authenticated;
GRANT SELECT (id, user_id, name, nickname, avatar_url, avatar_type, created_at, updated_at,
              is_placeholder, created_by_admin, privacy_settings, share_tagline, share_accent_color)
  ON public.user_profiles TO authenticated;
GRANT UPDATE (user_id, name, nickname, avatar_url, avatar_type, birth_date, dominant_hand,
              preferred_position, killer_shot, worst_shot, instagram_handle, privacy_settings,
              share_tagline, share_accent_color, updated_at)
  ON public.user_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profile_personal(_user_id uuid)
RETURNS TABLE(user_id uuid, birth_date date, instagram_handle text, dominant_hand text,
              preferred_position text, killer_shot text, worst_shot text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.user_id, p.birth_date, p.instagram_handle, p.dominant_hand,
         p.preferred_position, p.killer_shot, p.worst_shot
    FROM public.user_profiles p
   WHERE p.user_id = _user_id
     AND auth.uid() IS NOT NULL
     AND (
       p.user_id = auth.uid()
       OR (
         COALESCE((p.privacy_settings->>'show_personal')::boolean, true)
         AND p.deletion_scheduled_for IS NULL
         AND EXISTS (
           SELECT 1 FROM public.group_members mine
             JOIN public.group_members theirs ON theirs.group_id = mine.group_id
            WHERE mine.user_id = auth.uid() AND mine.status = 'active'
              AND theirs.user_id = p.user_id AND theirs.status = 'active')
       )
     );
$$;
REVOKE ALL ON FUNCTION public.get_profile_personal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_personal(uuid) TO authenticated, service_role;

-- 4) Move the daily deletion job from the legacy edge function to the authenticated app route
DO $$
BEGIN
  PERFORM cron.unschedule('process-pending-deletions-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'process-pending-deletions-daily',
  '15 6 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--7d2b46db-cc2c-4bbf-b4fb-43c67b894d27.lovable.app/api/public/hooks/process-deletions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-deletion-token', (SELECT token FROM public.deletion_scheduler_credentials WHERE id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);