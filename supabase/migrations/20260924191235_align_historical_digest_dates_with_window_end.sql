-- The automated editions through September 23 were named for the beginning
-- of their 06:00 UTC window. Preserve the separately published August 27
-- rolling-window edition and the earlier run of issues, then relabel the
-- automated editions from August 28 onward for the date their window ends.
DO $$
DECLARE
  old_day date;
BEGIN
  CREATE TEMP TABLE digest_relabel_runs ON COMMIT DROP AS
  SELECT run.id, run.digest_date AS old_date
  FROM public.digest_runs AS run
  WHERE run.digest_date BETWEEN DATE '2026-08-28' AND DATE '2026-09-23'
    AND run.window_start = ((run.digest_date + TIME '06:00') AT TIME ZONE 'UTC')
    AND run.window_end = ((run.digest_date + 1 + TIME '06:00') AT TIME ZONE 'UTC')
    AND run.workflow_run_id = 'systemd:' || run.digest_date::text;

  CREATE TEMP TABLE digest_relabel_editions ON COMMIT DROP AS
  SELECT edition.id, edition.digest_date AS old_date
  FROM public.digest_editions AS edition
  JOIN digest_relabel_runs AS run ON run.id = edition.source_run_id
  WHERE edition.digest_date = run.old_date
    AND edition.content->>'digestDate' = run.old_date::text;

  IF EXISTS (
    SELECT 1 FROM public.digest_runs
    WHERE workflow_run_id = 'systemd:2026-09-23'
  ) AND (
    (SELECT count(*) FROM digest_relabel_runs) <> 27
    OR (SELECT count(*) FROM digest_relabel_editions) <> 27
  ) THEN
    RAISE EXCEPTION 'Historical digest relabeling does not match the reviewed 27 editions';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.digest_editions AS edition
    JOIN digest_relabel_runs AS run ON run.id = edition.source_run_id
    LEFT JOIN digest_relabel_editions AS selected ON selected.id = edition.id
    WHERE selected.id IS NULL
  ) THEN
    RAISE EXCEPTION 'A digest edition attached to a relabeled run has an unexpected date';
  END IF;

  -- Descending dates free each next-day key before it is reused. This keeps
  -- the published-per-day and (date, version) uniqueness constraints intact.
  FOR old_day IN
    SELECT DISTINCT old_date FROM digest_relabel_runs ORDER BY old_date DESC
  LOOP
    UPDATE public.digest_runs AS run
    SET digest_date = old_day + 1,
        workflow_run_id = 'systemd:' || (old_day + 1)::text,
        parsed_output = CASE
          WHEN run.parsed_output ? 'digestDate' THEN
            jsonb_set(run.parsed_output, '{digestDate}', to_jsonb((old_day + 1)::text))
          ELSE run.parsed_output
        END
    FROM digest_relabel_runs AS selected
    WHERE run.id = selected.id AND selected.old_date = old_day;

    UPDATE public.digest_editions AS edition
    SET digest_date = old_day + 1,
        content = jsonb_set(
          edition.content, '{digestDate}', to_jsonb((old_day + 1)::text)
        )
    FROM digest_relabel_editions AS selected
    WHERE edition.id = selected.id AND selected.old_date = old_day;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."community_archive_monitoring_digest"()
RETURNS TABLE (
  "publication_age_seconds" double precision,
  "expected_date_published" double precision,
  "automated_run_failed" double precision,
  "healthy" double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH expected AS (
    SELECT
      ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '6 hours')::date
        AS digest_date,
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS checked_at
  ), latest_published AS (
    SELECT edition.digest_date, edition.published_at
    FROM public.digest_editions AS edition
    WHERE edition.status = 'published'
    ORDER BY edition.digest_date DESC, edition.version DESC
    LIMIT 1
  ), state AS (
    SELECT
      expected.digest_date AS expected_date,
      expected.checked_at,
      latest_published.digest_date AS published_date,
      latest_published.published_at,
      EXISTS (
        SELECT 1
        FROM public.digest_runs AS run
        WHERE run.digest_date = expected.digest_date
          AND run.status = 'failed'
          AND run.created_by IS NULL
          AND run.parent_run_id IS NULL
          AND run.workflow_run_id IS NOT NULL
      ) AS run_failed
    FROM expected
    LEFT JOIN latest_published ON TRUE
  )
  SELECT
    COALESCE(
      EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - state.published_at)),
      1000000000000
    )::double precision AS publication_age_seconds,
    COALESCE(state.published_date = state.expected_date, FALSE)::integer::double precision
      AS expected_date_published,
    state.run_failed::integer::double precision AS automated_run_failed,
    (
      CASE
        WHEN state.published_date = state.expected_date THEN 1
        WHEN state.run_failed THEN 0
        WHEN state.checked_at < state.expected_date::timestamp + INTERVAL '8 hours'
          THEN 1
        ELSE 0
      END
    )::double precision AS healthy
  FROM state;
$$;
ALTER FUNCTION "public"."community_archive_monitoring_digest"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."community_archive_monitoring_digest"()
  FROM PUBLIC, "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."community_archive_monitoring_digest"()
  TO "readclient";
