-- Schedule daily cleanup of og-cache bucket: delete files older than 7 days
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove existing schedule if present (idempotent)
do $$
begin
  perform cron.unschedule('og-cache-cleanup-daily');
exception when others then
  null;
end $$;

-- Run daily at 03:17 UTC
select cron.schedule(
  'og-cache-cleanup-daily',
  '17 3 * * *',
  $$
  delete from storage.objects
  where bucket_id = 'og-cache'
    and created_at < now() - interval '7 days';
  $$
);