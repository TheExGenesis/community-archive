-- The hourly job called ca_website.mark_completed_periods(), which no longer
-- exists, so every run failed. Production was unscheduled on 2026-10-16; this
-- keeps fresh and staging databases in the same state.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-completed-scraping-periods') THEN
    PERFORM cron.unschedule('mark-completed-scraping-periods');
  END IF;
END
$$;
