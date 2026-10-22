-- Runs are now keyed by a search run id the server picks before the workflow
-- starts; the Workflow run that executes it is recorded once it exists.
-- Rows written before this change keep the workflow run id as their id.
ALTER TABLE "public"."agent_search_runs"
  ADD COLUMN IF NOT EXISTS "workflow_run_id" text;

-- Admits one agent search question: in one transaction, under one lock, it
-- checks that nobody else owns the conversation, the member's daily count and
-- running run, and the global daily spend, then inserts the run as running.
-- Returns 'ok' or the reason it refused. Two requests can never both take the
-- last slot, and the run row exists before any paid work starts.
CREATE OR REPLACE FUNCTION public.agent_search_admit(
  p_run_id text,
  p_account_id text,
  p_conversation_id text,
  p_question text,
  p_model text,
  p_daily_limit integer,
  p_global_daily_usd numeric,
  p_stale_after_seconds integer
)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF p_run_id IS NULL OR p_account_id IS NULL OR p_conversation_id IS NULL
    OR p_question IS NULL OR p_model IS NULL
    OR p_daily_limit IS NULL OR p_daily_limit < 0
    OR p_global_daily_usd IS NULL OR p_global_daily_usd < 0
    OR p_stale_after_seconds IS NULL OR p_stale_after_seconds < 0
  THEN
    RAISE EXCEPTION 'Invalid agent search admission' USING ERRCODE = '22023';
  END IF;

  -- Admissions are rare, so one lock for all of them also serializes the
  -- global spend check across members.
  PERFORM pg_advisory_xact_lock(hashtext('public.agent_search_admit'));

  IF EXISTS (
    SELECT 1 FROM public.agent_search_runs
    WHERE conversation_id = p_conversation_id AND account_id <> p_account_id
  ) THEN
    RETURN 'not_found';
  END IF;

  IF (
    SELECT count(*) FROM public.agent_search_runs
    WHERE account_id = p_account_id AND started_at >= day_start
  ) >= p_daily_limit THEN
    RETURN 'daily_limit';
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

  INSERT INTO public.agent_search_runs (id, account_id, conversation_id, question, status, model)
  VALUES (p_run_id, p_account_id, p_conversation_id, p_question, 'running', p_model);
  RETURN 'ok';
END
$$;
REVOKE ALL ON FUNCTION public.agent_search_admit(text, text, text, text, text, integer, numeric, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_search_admit(text, text, text, text, text, integer, numeric, integer) TO service_role;
