-- A monthly question limit alongside the daily one, counted the same way:
-- a house question counts against the member's house questions this UTC
-- month, an own-key question against all of their questions this month,
-- under the higher limit the caller passes for it.
--
-- Ask the archive ships with this migration, so no deployed code calls the
-- eight-argument function from 20261009130000 or the nine-argument one from
-- 20261013120000; both are dropped rather than kept as overloads.

DROP FUNCTION IF EXISTS public.agent_search_admit(text, text, text, text, text, integer, numeric, integer);
DROP FUNCTION IF EXISTS public.agent_search_admit(text, text, text, text, text, integer, numeric, integer, text);

CREATE OR REPLACE FUNCTION public.agent_search_admit(
  p_run_id text,
  p_account_id text,
  p_conversation_id text,
  p_question text,
  p_model text,
  p_daily_limit integer,
  p_global_daily_usd numeric,
  p_stale_after_seconds integer,
  p_key_source text,
  p_monthly_limit integer
)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF p_run_id IS NULL OR p_account_id IS NULL OR p_conversation_id IS NULL
    OR p_question IS NULL OR p_model IS NULL
    OR p_daily_limit IS NULL OR p_daily_limit < 0
    OR p_global_daily_usd IS NULL OR p_global_daily_usd < 0
    OR p_stale_after_seconds IS NULL OR p_stale_after_seconds < 0
    OR p_key_source IS NULL OR p_key_source NOT IN ('house', 'own')
    OR p_monthly_limit IS NULL OR p_monthly_limit < 0
  THEN
    RAISE EXCEPTION 'Invalid agent search admission' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.agent_search_admit'));

  IF EXISTS (
    SELECT 1 FROM public.agent_search_runs
    WHERE conversation_id = p_conversation_id AND account_id <> p_account_id
  ) THEN
    RETURN 'not_found';
  END IF;

  IF (
    SELECT count(*) FROM public.agent_search_runs
    WHERE account_id = p_account_id
      AND started_at >= day_start
      AND (p_key_source = 'own' OR key_source = 'house')
  ) >= p_daily_limit THEN
    RETURN 'daily_limit';
  END IF;

  IF (
    SELECT count(*) FROM public.agent_search_runs
    WHERE account_id = p_account_id
      AND started_at >= month_start
      AND (p_key_source = 'own' OR key_source = 'house')
  ) >= p_monthly_limit THEN
    RETURN 'monthly_limit';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_search_runs
    WHERE account_id = p_account_id
      AND status = 'running'
      AND started_at > now() - make_interval(secs => p_stale_after_seconds)
  ) THEN
    RETURN 'run_in_progress';
  END IF;

  IF (
    SELECT coalesce(sum(cost_usd), 0) FROM public.agent_search_runs
    WHERE started_at >= day_start
  ) >= p_global_daily_usd THEN
    RETURN 'global_budget';
  END IF;

  INSERT INTO public.agent_search_runs (id, account_id, conversation_id, question, status, model, key_source)
  VALUES (p_run_id, p_account_id, p_conversation_id, p_question, 'running', p_model, p_key_source);
  RETURN 'ok';
END
$$;
REVOKE ALL ON FUNCTION public.agent_search_admit(text, text, text, text, text, integer, numeric, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_search_admit(text, text, text, text, text, integer, numeric, integer, text, integer) TO service_role;
