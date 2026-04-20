-- 1) Backfill: rounds in singles_group_type='rivalry' should have max_players=2 (not 8)
UPDATE rounds r
SET max_players = 2, updated_at = now()
FROM groups g
WHERE r.group_id = g.id
  AND g.match_format = 'singles'
  AND g.singles_group_type = 'rivalry'
  AND r.max_players <> 2;

-- 2) Deactivate claim invites whose placeholder is no longer a placeholder (already linked)
UPDATE invite_links il
SET is_active = false
FROM user_profiles up
WHERE il.claim_placeholder_user_id = up.user_id
  AND il.is_active = true
  AND up.is_placeholder = false;

-- 3) Trigger: when a round is inserted for a rivalry group, force max_players=2
CREATE OR REPLACE FUNCTION public.enforce_rivalry_round_max_players()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _gtype text;
  _gfmt text;
BEGIN
  SELECT match_format, singles_group_type INTO _gfmt, _gtype
  FROM groups WHERE id = NEW.group_id;
  IF _gfmt = 'singles' AND _gtype = 'rivalry' THEN
    NEW.max_players := 2;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_rivalry_round_max_players ON public.rounds;
CREATE TRIGGER trg_enforce_rivalry_round_max_players
BEFORE INSERT OR UPDATE OF max_players ON public.rounds
FOR EACH ROW EXECUTE FUNCTION public.enforce_rivalry_round_max_players();

-- 4) Schedule cron to call presence-window-opened every 5 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove if already scheduled
DO $$
BEGIN
  PERFORM cron.unschedule('presence-window-opened');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'presence-window-opened',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rankmymatch.lovable.app/hooks/presence-window-opened',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9laXpwcXl2bm1pY2tvc295bnJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjEyNzcsImV4cCI6MjA5MTgzNzI3N30.tHbjvfgmZY5z0Lk2UCsz3l_m0mII9g7Sr_XNSL0PFls"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);