create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job
    where jobname in ('kutt-adsterra-report-morning', 'kutt-adsterra-report-evening')
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'kutt-adsterra-report-morning',
  '0 11 * * *',
  $$
    select net.http_post(
      url := 'https://ggufcvrwctieacvbbwim.supabase.co/functions/v1/kutt-short-links',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'kutt_publishable_key'),
        'x-kutt-report-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kutt_report_cron_secret')
      ),
      body := '{"action":"scheduled-adsterra-report"}'::jsonb,
      timeout_milliseconds := 30000
    )
  $$
);

select cron.schedule(
  'kutt-adsterra-report-evening',
  '0 23 * * *',
  $$
    select net.http_post(
      url := 'https://ggufcvrwctieacvbbwim.supabase.co/functions/v1/kutt-short-links',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'kutt_publishable_key'),
        'x-kutt-report-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kutt_report_cron_secret')
      ),
      body := '{"action":"scheduled-adsterra-report"}'::jsonb,
      timeout_milliseconds := 30000
    )
  $$
);
