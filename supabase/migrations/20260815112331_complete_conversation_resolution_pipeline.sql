-- Complete the conversation-resolution rollout for environments that applied
-- the initial migration before reconciliation and snapshot monitoring landed.
-- Every statement is safe after the complete initial migration as well.

CREATE TABLE IF NOT EXISTS public.conversation_resolution_reconciliation (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  status text NOT NULL DEFAULT 'paused'
    CHECK (status IN ('paused', 'running', 'complete')),
  cursor_tweet_id text,
  high_watermark_tweet_id text,
  examined_count bigint NOT NULL DEFAULT 0 CHECK (examined_count >= 0),
  queued_count bigint NOT NULL DEFAULT 0 CHECK (queued_count >= 0),
  root_count bigint NOT NULL DEFAULT 0 CHECK (root_count >= 0),
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);

INSERT INTO public.conversation_resolution_reconciliation (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.conversation_resolution_coverage_snapshots (
  producer_source text NOT NULL,
  resolution_status text NOT NULL,
  row_count bigint NOT NULL CHECK (row_count >= 0),
  latest_observed_at timestamptz,
  latest_resolved_at timestamptz,
  oldest_ready_at timestamptz,
  max_attempt_count integer,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producer_source, resolution_status)
);

ALTER TABLE public.conversation_resolution_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_resolution_coverage_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversation_resolution_reconciliation FROM anon, authenticated;
REVOKE ALL ON public.conversation_resolution_coverage_snapshots FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversation_resolution_reconciliation
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.conversation_resolution_coverage_snapshots TO service_role;

CREATE OR REPLACE FUNCTION private.configure_conversation_resolution_reconciliation(
  p_run boolean DEFAULT false,
  p_reset boolean DEFAULT false
)
RETURNS TABLE (
  status text,
  cursor_tweet_id text,
  high_watermark_tweet_id text,
  examined_count bigint,
  queued_count bigint,
  root_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_high_watermark text;
BEGIN
  SELECT max(tweets.tweet_id)
  INTO v_high_watermark
  FROM public.tweets;

  RETURN QUERY
  UPDATE public.conversation_resolution_reconciliation AS state
  SET
    status = CASE WHEN p_run THEN 'running' ELSE 'paused' END,
    cursor_tweet_id = CASE WHEN p_reset THEN NULL ELSE state.cursor_tweet_id END,
    high_watermark_tweet_id = CASE
      WHEN p_reset OR state.high_watermark_tweet_id IS NULL
        THEN v_high_watermark
      ELSE state.high_watermark_tweet_id
    END,
    examined_count = CASE WHEN p_reset THEN 0 ELSE state.examined_count END,
    queued_count = CASE WHEN p_reset THEN 0 ELSE state.queued_count END,
    root_count = CASE WHEN p_reset THEN 0 ELSE state.root_count END,
    started_at = CASE
      WHEN p_reset OR state.started_at IS NULL THEN now()
      ELSE state.started_at
    END,
    updated_at = now(),
    last_error = NULL
  WHERE state.id
  RETURNING
    state.status,
    state.cursor_tweet_id,
    state.high_watermark_tweet_id,
    state.examined_count,
    state.queued_count,
    state.root_count;
END;
$$;

CREATE OR REPLACE FUNCTION private.process_conversation_resolution_reconciliation_batch(
  p_limit integer DEFAULT 500,
  p_dry_run boolean DEFAULT false
)
RETURNS TABLE (
  examined integer,
  queued integer,
  roots integer,
  next_cursor text,
  complete boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state public.conversation_resolution_reconciliation%ROWTYPE;
  v_examined integer := 0;
  v_queued integer := 0;
  v_roots integer := 0;
  v_next_cursor text;
  v_complete boolean := false;
BEGIN
  IF p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'conversation reconciliation batch must be between 1 and 5000';
  END IF;

  SELECT *
  INTO v_state
  FROM public.conversation_resolution_reconciliation
  WHERE id
  FOR UPDATE;

  IF v_state.high_watermark_tweet_id IS NULL THEN
    RAISE EXCEPTION 'configure conversation reconciliation before processing';
  END IF;

  IF NOT p_dry_run AND v_state.status <> 'running' THEN
    RAISE EXCEPTION 'conversation reconciliation is %', v_state.status;
  END IF;

  IF p_dry_run THEN
    WITH candidates AS MATERIALIZED (
      SELECT tweets.tweet_id, tweets.reply_to_tweet_id
      FROM public.tweets AS tweets
      WHERE (
        v_state.cursor_tweet_id IS NULL
        OR tweets.tweet_id > v_state.cursor_tweet_id
      )
        AND tweets.tweet_id <= v_state.high_watermark_tweet_id
      ORDER BY tweets.tweet_id
      LIMIT p_limit
    )
    SELECT
      count(*)::integer,
      count(*) FILTER (
        WHERE existing.tweet_id IS NULL
          OR (
            existing.conversation_id IS NULL
            AND existing.resolution_status <> 'authoritative'
          )
      )::integer,
      count(*) FILTER (
        WHERE candidate.reply_to_tweet_id IS NULL
          AND (
            existing.tweet_id IS NULL
            OR (
              existing.conversation_id IS NULL
              AND existing.resolution_status <> 'authoritative'
            )
          )
      )::integer,
      max(candidate.tweet_id)
    INTO v_examined, v_queued, v_roots, v_next_cursor
    FROM candidates AS candidate
    LEFT JOIN public.conversations AS existing
      ON existing.tweet_id = candidate.tweet_id;
  ELSE
    WITH candidates AS MATERIALIZED (
      SELECT tweets.tweet_id, tweets.reply_to_tweet_id
      FROM public.tweets AS tweets
      WHERE (
        v_state.cursor_tweet_id IS NULL
        OR tweets.tweet_id > v_state.cursor_tweet_id
      )
        AND tweets.tweet_id <= v_state.high_watermark_tweet_id
      ORDER BY tweets.tweet_id
      LIMIT p_limit
    ), changed_rows AS (
      INSERT INTO public.conversations (
        tweet_id,
        conversation_id,
        producer_source,
        resolution_status,
        resolved_at,
        attempt_count,
        next_attempt_at,
        last_error
      )
      SELECT
        candidate.tweet_id,
        CASE
          WHEN candidate.reply_to_tweet_id IS NULL THEN candidate.tweet_id
          ELSE NULL
        END,
        'historical_reconciliation',
        CASE
          WHEN candidate.reply_to_tweet_id IS NULL THEN 'root'
          ELSE 'pending'
        END,
        CASE
          WHEN candidate.reply_to_tweet_id IS NULL THEN now()
          ELSE NULL
        END,
        0,
        now(),
        NULL
      FROM candidates AS candidate
      ON CONFLICT (tweet_id) DO UPDATE
      SET
        conversation_id = EXCLUDED.conversation_id,
        producer_source = EXCLUDED.producer_source,
        resolution_status = EXCLUDED.resolution_status,
        resolved_at = EXCLUDED.resolved_at,
        attempt_count = 0,
        next_attempt_at = now(),
        last_error = NULL
      WHERE public.conversations.conversation_id IS NULL
        AND public.conversations.resolution_status <> 'authoritative'
      RETURNING resolution_status
    )
    SELECT
      (SELECT count(*)::integer FROM candidates),
      count(*)::integer,
      count(*) FILTER (WHERE resolution_status = 'root')::integer,
      (SELECT max(tweet_id) FROM candidates)
    INTO v_examined, v_queued, v_roots, v_next_cursor
    FROM changed_rows;
  END IF;

  v_complete := v_examined < p_limit
    OR v_next_cursor >= v_state.high_watermark_tweet_id;

  IF NOT p_dry_run THEN
    UPDATE public.conversation_resolution_reconciliation AS state
    SET
      status = CASE WHEN v_complete THEN 'complete' ELSE 'running' END,
      cursor_tweet_id = COALESCE(v_next_cursor, state.cursor_tweet_id),
      examined_count = state.examined_count + v_examined,
      queued_count = state.queued_count + v_queued,
      root_count = state.root_count + v_roots,
      updated_at = now(),
      last_error = NULL
    WHERE state.id;
  END IF;

  RETURN QUERY
  SELECT v_examined, v_queued, v_roots, v_next_cursor, v_complete;
END;
$$;

REVOKE ALL ON FUNCTION private.configure_conversation_resolution_reconciliation(boolean, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.process_conversation_resolution_reconciliation_batch(integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.configure_conversation_resolution_reconciliation(boolean, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION private.process_conversation_resolution_reconciliation_batch(integer, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION private.refresh_conversation_resolution_coverage()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.conversation_resolution_coverage_snapshots;

  INSERT INTO public.conversation_resolution_coverage_snapshots (
    producer_source,
    resolution_status,
    row_count,
    latest_observed_at,
    latest_resolved_at,
    oldest_ready_at,
    max_attempt_count,
    snapshot_at
  )
  SELECT
    health.producer_source,
    health.resolution_status,
    health.row_count,
    health.latest_observed_at,
    health.latest_resolved_at,
    health.oldest_ready_at,
    health.max_attempt_count,
    now()
  FROM public.conversation_resolution_health AS health;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION private.refresh_conversation_resolution_coverage()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.refresh_conversation_resolution_coverage()
  TO service_role;

CREATE OR REPLACE FUNCTION private.community_archive_monitoring_conversation_resolution_health()
RETURNS TABLE (
  producer_source text,
  resolution_status text,
  row_count bigint,
  latest_observed_at timestamptz,
  latest_resolved_at timestamptz,
  oldest_ready_at timestamptz,
  max_attempt_count integer,
  snapshot_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    health.producer_source,
    health.resolution_status,
    health.row_count,
    health.latest_observed_at,
    health.latest_resolved_at,
    health.oldest_ready_at,
    health.max_attempt_count,
    health.snapshot_at
  FROM public.conversation_resolution_coverage_snapshots AS health;
$$;

CREATE OR REPLACE FUNCTION private.community_archive_monitoring_conversation_resolution_worker()
RETURNS TABLE (
  finished_at timestamptz,
  attempted integer,
  resolved integer,
  deferred integer,
  ready_after integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    latest.finished_at,
    COALESCE(latest.attempted, 0),
    COALESCE(latest.resolved, 0),
    COALESCE(latest.deferred, 0),
    COALESCE(latest.ready_after, 0)
  FROM (VALUES (true)) AS sentinel(include_row)
  LEFT JOIN LATERAL (
    SELECT
      runs.finished_at,
      runs.attempted,
      runs.resolved,
      runs.deferred,
      runs.ready_after
    FROM public.conversation_resolution_runs AS runs
    ORDER BY runs.finished_at DESC
    LIMIT 1
  ) AS latest ON sentinel.include_row;
$$;

CREATE OR REPLACE FUNCTION private.community_archive_monitoring_conversation_reconciliation()
RETURNS TABLE (
  status text,
  examined_count bigint,
  queued_count bigint,
  root_count bigint,
  started_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    state.status,
    state.examined_count,
    state.queued_count,
    state.root_count,
    state.started_at,
    state.updated_at
  FROM public.conversation_resolution_reconciliation AS state
  WHERE state.id;
$$;

REVOKE ALL ON FUNCTION private.community_archive_monitoring_conversation_resolution_health()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.community_archive_monitoring_conversation_resolution_worker()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.community_archive_monitoring_conversation_reconciliation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.community_archive_monitoring_conversation_resolution_health()
  TO service_role;
GRANT EXECUTE ON FUNCTION private.community_archive_monitoring_conversation_resolution_worker()
  TO service_role;
GRANT EXECUTE ON FUNCTION private.community_archive_monitoring_conversation_reconciliation()
  TO service_role;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'snapshot-conversation-resolution-coverage';

    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
      'snapshot-conversation-resolution-coverage',
      '17 4 * * *',
      'SELECT private.refresh_conversation_resolution_coverage();'
    );
  END IF;
END;
$$;

COMMENT ON TABLE public.conversation_resolution_reconciliation IS
  'Durable cursor and progress for an explicitly enabled bounded historical reconciliation.';
COMMENT ON VIEW public.conversation_resolution_health IS
  'Live conversation coverage grouped by ingestion source and resolution status; refresh only through the daily monitoring snapshot.';
COMMENT ON TABLE public.conversation_resolution_coverage_snapshots IS
  'Daily per-source coverage snapshot used by monitoring without repeatedly scanning the serving table.';
