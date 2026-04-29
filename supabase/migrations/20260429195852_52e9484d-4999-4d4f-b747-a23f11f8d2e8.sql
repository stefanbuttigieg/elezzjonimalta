CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_secret text;
  v_jobid bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'NEWS_CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE NOTICE 'NEWS_CRON_SECRET not found in vault; skipping cron registration';
    RETURN;
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'news-monitor-scan';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule('news-monitor-scan');
  END IF;

  PERFORM cron.schedule(
    'news-monitor-scan',
    '0 6,11,16,21 * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://elezzjonimalta.lovable.app/api/public/hooks/scan-news',
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', %L),
        body := '{"trigger":"cron"}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cmd$, v_secret)
  );
END $$;