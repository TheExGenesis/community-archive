-- Admin-triggered refreshes are durable, bounded jobs consumed by the worker.
CREATE TABLE bulletin.refresh_requests (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  prompt_version_id bigint NOT NULL REFERENCES bulletin.prompt_versions(id),
  budget_usd numeric NOT NULL CHECK (budget_usd > 0 AND budget_usd <= 1),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','stopped')),
  last_status text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end > window_start AND window_end-window_start <= interval '15 days')
);
CREATE UNIQUE INDEX bulletin_one_active_refresh ON bulletin.refresh_requests ((true))
  WHERE status IN ('queued','running');
ALTER TABLE bulletin.decisions ADD COLUMN refresh_request_id uuid REFERENCES bulletin.refresh_requests(id);
CREATE INDEX bulletin_refresh_pending_idx ON bulletin.decisions(refresh_request_id,updated_at)
  WHERE status IN ('pending','failed');

CREATE FUNCTION public.request_bulletin_refresh(request_id uuid, selection text, expected_prompt_id bigint, budget_usd numeric, actor_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE start_at timestamptz; end_at timestamptz; active_id bigint;
BEGIN
  -- Share the prompt-save lock so the version shown at submission is pinned.
  PERFORM pg_advisory_xact_lock(712606571);
  IF actor_id IS NULL OR request_id IS NULL OR selection IS NULL OR selection NOT IN ('latest','two_weeks')
    OR budget_usd IS NULL OR NOT (budget_usd > 0 AND budget_usd <= 1) THEN
    RAISE EXCEPTION 'Invalid refresh request' USING ERRCODE='22023';
  END IF;
  -- Retries of the same submission never create another billable job.
  IF EXISTS (SELECT 1 FROM bulletin.refresh_requests r WHERE r.id=request_id AND r.created_by=actor_id) THEN
    RETURN request_id::text;
  END IF;
  SELECT id INTO active_id FROM bulletin.prompt_versions ORDER BY id DESC LIMIT 1;
  IF expected_prompt_id IS DISTINCT FROM active_id OR active_id IS NULL THEN
    RAISE EXCEPTION 'Prompt changed; reload' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM bulletin.refresh_requests WHERE status IN ('queued','running')) THEN
    RAISE EXCEPTION 'A refresh is already active' USING ERRCODE='55000';
  END IF;
  IF selection='latest' THEN
    SELECT (counts->>'window_start')::timestamptz,(counts->>'window_end')::timestamptz
      INTO start_at,end_at FROM bulletin.runs
      WHERE counts->>'source'='clickhouse' AND counts ? 'window_start' AND counts ? 'window_end'
      ORDER BY id DESC LIMIT 1;
    IF start_at IS NULL OR end_at IS NULL THEN
      RAISE EXCEPTION 'No previous scan window' USING ERRCODE='22023';
    END IF;
  ELSE
    end_at := date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    start_at := end_at-interval '14 days';
  END IF;
  INSERT INTO bulletin.refresh_requests(id,created_by,window_start,window_end,prompt_version_id,budget_usd)
    VALUES(request_id,actor_id,start_at,end_at,active_id,budget_usd);
  RETURN request_id::text;
END
$$;

CREATE FUNCTION public.get_bulletin_refreshes()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.created_at DESC),'[]'::jsonb) FROM (
    SELECT r.*,r.prompt_version_id::text AS prompt_id,
      coalesce(cost.spent,0) AS spent_usd,latest.counts
    FROM bulletin.refresh_requests r
    LEFT JOIN LATERAL (
      SELECT sum(coalesce(c.actual_usd,c.reserved_usd)) AS spent
      FROM bulletin.runs run JOIN bulletin.calls c ON c.run_id=run.id
      WHERE run.counts->>'refresh_request_id'=r.id::text
    ) cost ON true
    LEFT JOIN LATERAL (
      SELECT run.counts FROM bulletin.runs run
      WHERE run.counts->>'refresh_request_id'=r.id::text ORDER BY run.id DESC LIMIT 1
    ) latest ON true
    ORDER BY r.created_at DESC LIMIT 10
  ) item
$$;
CREATE INDEX bulletin_runs_refresh_idx ON bulletin.runs ((counts->>'refresh_request_id'))
  WHERE counts ? 'refresh_request_id';

ALTER TABLE bulletin.refresh_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulletin.refresh_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON bulletin.refresh_requests TO service_role;
REVOKE ALL ON FUNCTION public.request_bulletin_refresh(uuid,text,bigint,numeric,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_bulletin_refreshes() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_bulletin_refresh(uuid,text,bigint,numeric,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_bulletin_refreshes() TO service_role;
