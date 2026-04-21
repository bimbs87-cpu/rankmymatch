-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule daily run at 03:15 UTC
-- Uses Vault to retrieve the cron secret if present; falls back to anon header otherwise.
DO $$
DECLARE
  _project_url text := 'https://oeizpqyvnmickosoynrr.supabase.co';
BEGIN
  -- Drop existing schedule if present (idempotent)
  PERFORM cron.unschedule('process-pending-deletions-daily')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'process-pending-deletions-daily'
  );

  PERFORM cron.schedule(
    'process-pending-deletions-daily',
    '15 3 * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := '%s/functions/v1/process-pending-deletions',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', coalesce(current_setting('app.cron_secret', true), '')
        ),
        body := '{}'::jsonb
      ) as request_id;
      $cron$,
      _project_url
    )
  );
END $$;