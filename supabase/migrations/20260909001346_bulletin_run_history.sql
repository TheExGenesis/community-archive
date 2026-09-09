-- Aggregate run history contains no tweet text or author identifiers.
CREATE TABLE bulletin.runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  counts jsonb NOT NULL DEFAULT '{}',
  model text NOT NULL,
  classifier_version text NOT NULL
);
ALTER TABLE bulletin.calls ADD COLUMN run_id bigint REFERENCES bulletin.runs(id);
CREATE INDEX bulletin_calls_run_idx ON bulletin.calls(run_id);

CREATE FUNCTION public.get_bulletin_runs(before_id bigint DEFAULT NULL, max_results integer DEFAULT 26)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object(
   'runs', coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY page.id::bigint DESC) FROM (
     SELECT r.id::text AS id,r.started_at,r.finished_at,r.status,r.counts,r.model,r.classifier_version,
       coalesce(c.actual_usd,0) AS actual_usd,coalesce(c.unpriced_reserved_usd,0) AS unpriced_reserved_usd
     FROM bulletin.runs r LEFT JOIN LATERAL (
       SELECT sum(actual_usd) AS actual_usd,
         sum(reserved_usd) FILTER (WHERE actual_usd IS NULL) AS unpriced_reserved_usd
       FROM bulletin.calls WHERE run_id=r.id
     ) c ON true
     WHERE before_id IS NULL OR r.id<before_id
     ORDER BY r.id DESC LIMIT greatest(1,least(coalesce(max_results,26),51))
   ) page),'[]'::jsonb),
   'queue', (SELECT jsonb_build_object(
     'pending',count(*) FILTER (WHERE status='pending'),
     'retrying',count(*) FILTER (WHERE status='failed' AND attempts<3),
     'exhausted',count(*) FILTER (WHERE status='failed' AND attempts>=3)) FROM bulletin.decisions),
   'last_success_at',(SELECT last_success_at FROM bulletin.worker_state WHERE id=1)
 )
$$;

ALTER TABLE bulletin.runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulletin.runs FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE bulletin.runs_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON bulletin.runs TO service_role;
GRANT USAGE,SELECT ON SEQUENCE bulletin.runs_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.get_bulletin_runs(bigint,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_runs(bigint,integer) TO service_role;
