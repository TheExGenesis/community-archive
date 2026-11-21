-- Admin-only forecast track record: storage, ingestion with consent, opt-out removal.

-- Forecast track record (admin-only research tool). One uploaded run of the
-- control-panel track_record pipeline: aggregates in the run row, and each
-- member's forecasts and score in an author row. Only the latest run is kept.
CREATE TABLE IF NOT EXISTS private.forecast_track_record_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  as_of date,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  -- Aggregate counts only: funnel, method, calibration, spread test, audits.
  summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary) = 'object')
);
ALTER TABLE private.forecast_track_record_runs OWNER TO postgres;

CREATE TABLE IF NOT EXISTS private.forecast_track_record_authors (
  run_id bigint NOT NULL REFERENCES private.forecast_track_record_runs(id) ON DELETE CASCADE,
  account_id text NOT NULL CHECK (account_id ~ '^[1-9][0-9]{0,19}$'),
  username text NOT NULL,
  score jsonb,
  profile jsonb,
  claims jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(claims) = 'array'),
  PRIMARY KEY (run_id, account_id)
);
ALTER TABLE private.forecast_track_record_authors OWNER TO postgres;

-- Opt-out removal deletes by account.
CREATE INDEX IF NOT EXISTS forecast_track_record_authors_account_idx
  ON private.forecast_track_record_authors (account_id);

-- Replace the forecast track record with one uploaded run. Consent is applied
-- here, at ingestion: an author who is not a current account, or whose account
-- is blocked or opted out, is never written. Serving reads rows as stored.
CREATE OR REPLACE FUNCTION public.replace_forecast_track_record(
  p_as_of date,
  p_summary jsonb,
  p_authors jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run_id bigint;
  v_given integer;
  v_kept integer;
BEGIN
  IF jsonb_typeof(p_summary) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_authors) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_summary must be an object and p_authors an array';
  END IF;

  -- safeupdate rejects an unqualified DELETE from API sessions.
  DELETE FROM private.forecast_track_record_runs WHERE id IS NOT NULL;
  INSERT INTO private.forecast_track_record_runs (as_of, summary)
  VALUES (p_as_of, p_summary)
  RETURNING id INTO v_run_id;

  v_given := jsonb_array_length(p_authors);

  INSERT INTO private.forecast_track_record_authors
    (run_id, account_id, username, score, profile, claims)
  SELECT DISTINCT ON (acct.account_id)
    v_run_id, acct.account_id, acct.username,
    NULLIF(item->'score', 'null'::jsonb),
    NULLIF(item->'profile', 'null'::jsonb),
    COALESCE(item->'claims', '[]'::jsonb)
  FROM jsonb_array_elements(p_authors) AS item
  JOIN public.all_account AS acct
    ON lower(acct.username) = lower(BTRIM(item->>'username', ' @'))
   AND acct.is_tombstone IS NOT TRUE
  WHERE jsonb_typeof(COALESCE(item->'claims', '[]'::jsonb)) = 'array'
    AND NOT public.policy_account_is_blocked(acct.account_id, acct.username)
  ORDER BY acct.account_id;

  GET DIAGNOSTICS v_kept = ROW_COUNT;
  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'authors_given', v_given,
    'authors_kept', v_kept,
    'authors_dropped', v_given - v_kept
  );
END;
$$;
ALTER FUNCTION public.replace_forecast_track_record(date, jsonb, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_forecast_track_record(date, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_forecast_track_record(date, jsonb, jsonb)
  TO service_role;

-- The stored run for the admin page, or NULL when none was uploaded.
CREATE OR REPLACE FUNCTION public.get_forecast_track_record()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'as_of', run.as_of,
    'uploaded_at', run.uploaded_at,
    'summary', run.summary,
    'authors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'username', author.username,
        'score', author.score,
        'profile', author.profile,
        'claims', author.claims
      ) ORDER BY lower(author.username))
      FROM private.forecast_track_record_authors AS author
      WHERE author.run_id = run.id
    ), '[]'::jsonb)
  )
  FROM private.forecast_track_record_runs AS run
  ORDER BY run.uploaded_at DESC
  LIMIT 1;
$$;
ALTER FUNCTION public.get_forecast_track_record() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_forecast_track_record()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_forecast_track_record() TO service_role;

-- A policy block (explicit opt-out or admin block) removes the account's
-- forecasts in the same transaction that records the block.
CREATE OR REPLACE FUNCTION private.purge_forecast_track_record_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM private.forecast_track_record_authors AS author
  WHERE author.account_id = NEW.account_id
     OR (NULLIF(BTRIM(NEW.username), '') IS NOT NULL
         AND lower(author.username) = lower(BTRIM(NEW.username)));
  RETURN NEW;
END;
$$;
ALTER FUNCTION private.purge_forecast_track_record_on_block() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.purge_forecast_track_record_on_block()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE TRIGGER purge_forecast_track_record_on_block
AFTER INSERT OR UPDATE OF account_id, username ON tes.blocked_scraping_users
FOR EACH ROW EXECUTE FUNCTION private.purge_forecast_track_record_on_block();

-- Forecast track record: service-role functions only; no client role reads the tables.
ALTER TABLE private.forecast_track_record_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.forecast_track_record_authors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.forecast_track_record_runs, private.forecast_track_record_authors
  FROM PUBLIC, anon, authenticated, readclient, service_role;
