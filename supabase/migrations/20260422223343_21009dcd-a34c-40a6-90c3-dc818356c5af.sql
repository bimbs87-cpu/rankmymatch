-- Garante extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior, se existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-report-day-1') THEN
    PERFORM cron.unschedule('monthly-report-day-1');
  END IF;
END $$;

-- Agenda no dia 1 de cada mês, 09:00 UTC
SELECT cron.schedule(
  'monthly-report-day-1',
  '0 9 1 * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://project--7d2b46db-cc2c-4bbf-b4fb-43c67b894d27.lovable.app/api/public/hooks/monthly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cmd$
);