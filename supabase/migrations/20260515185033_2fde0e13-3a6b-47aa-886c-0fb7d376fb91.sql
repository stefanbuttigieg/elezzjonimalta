CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule with the same name (idempotent re-runs).
DO $$
BEGIN
  PERFORM cron.unschedule('manifesto-import-tick');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'manifesto-import-tick',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--06c5b59d-0722-415a-8621-0497828e68c8.lovable.app/api/public/hooks/manifesto-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYm1yYXZ0cGF1Y2hpZWVydXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTE5MjcsImV4cCI6MjA5Mjk2NzkyN30.sSoq9vOYXjq-q8woX_MLtuleabZgCaacNCZs3PAetPw'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
  $cron$
);