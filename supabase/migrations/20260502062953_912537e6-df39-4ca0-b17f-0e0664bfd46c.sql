create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('telegram-poll-every-minute');
exception when others then
  null;
end $$;

select
  cron.schedule(
    'telegram-poll-every-minute',
    '* * * * *',
    $$
    select net.http_post(
      url := 'https://project--06c5b59d-0722-415a-8621-0497828e68c8.lovable.app/api/public/hooks/telegram-poll',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $$
  );