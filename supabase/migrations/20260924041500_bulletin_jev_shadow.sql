-- Jev shadow decisions are private and cannot change the board until cutover.
CREATE TABLE bulletin.pipeline_state (
  id integer PRIMARY KEY CHECK (id=1),
  active text NOT NULL DEFAULT 'legacy' CHECK (active IN ('legacy','jev'))
);
INSERT INTO bulletin.pipeline_state(id) VALUES (1);

CREATE TABLE bulletin.jev_items (
  tweet_id text PRIMARY KEY,
  account_id text NOT NULL,
  posted_at timestamptz NOT NULL,
  content_hash text NOT NULL,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','failed','ready','rejected')),
  phase text NOT NULL DEFAULT 'disposition' CHECK (phase IN ('disposition','enrich','value')),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  disposition jsonb,
  enrichment jsonb,
  value_answer jsonb,
  p_opportunity numeric CHECK (p_opportunity BETWEEN 0 AND 1),
  p_direct numeric CHECK (p_direct BETWEEN 0 AND 1),
  p_joke numeric CHECK (p_joke BETWEEN 0 AND 1),
  value_score numeric CHECK (value_score BETWEEN 0 AND 4),
  side text CHECK (side IN ('ask','offer')),
  kind text CHECK (kind IN ('help','feedback','intro','free','invite','opportunity','other')),
  summary text CHECK (length(summary) BETWEEN 1 AND 500),
  evidence text,
  topics text[] NOT NULL DEFAULT '{}',
  respond text CHECK (respond IN ('dm','reply','link','like','unknown')),
  standing boolean NOT NULL DEFAULT false,
  expires_at date,
  place text,
  model text NOT NULL DEFAULT 'typesafe/jev-1.13',
  resolution_state text NOT NULL DEFAULT 'unknown' CHECK (resolution_state IN ('unknown','open','resolved')),
  resolution_tweet_id text,
  resolution_content_hash text,
  context_digest text,
  context_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'ready' OR (side IS NOT NULL AND kind IS NOT NULL AND summary IS NOT NULL AND evidence IS NOT NULL)),
  CHECK ((resolution_state='unknown' AND resolution_tweet_id IS NULL AND resolution_content_hash IS NULL)
    OR (resolution_state IN ('open','resolved') AND resolution_tweet_id ~ '^[0-9]{1,20}$'
      AND resolution_content_hash ~ '^[0-9a-f]{64}$'))
);
CREATE INDEX bulletin_jev_pending_idx ON bulletin.jev_items(updated_at)
  WHERE status IN ('pending','failed');
CREATE INDEX bulletin_jev_ready_idx ON bulletin.jev_items(posted_at DESC)
  WHERE status='ready';
CREATE INDEX bulletin_jev_resolution_idx ON bulletin.jev_items(context_checked_at NULLS FIRST,tweet_id)
  WHERE status='ready';
ALTER TABLE bulletin.pipeline_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin.jev_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulletin.pipeline_state,bulletin.jev_items FROM PUBLIC,anon,authenticated;
GRANT SELECT ON bulletin.pipeline_state TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON bulletin.jev_items TO service_role;

CREATE OR REPLACE FUNCTION public.get_bulletin_board_state(max_results integer DEFAULT 2000)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(notice) ORDER BY notice.posted_at DESC,notice.tweet_id DESC),'[]'::jsonb)
 FROM (
   SELECT o.tweet_id,o.content_hash,o.side,o.kind,o.summary,o.evidence,o.topics,o.respond,
     o.standing,o.expires_at,o.place,o.model,o.resolution_state,o.resolution_tweet_id,
     o.resolution_content_hash,d.account_id,d.posted_at,a.username,
     NULL::numeric AS p_opportunity,NULL::numeric AS p_direct,NULL::numeric AS p_joke,
     NULL::numeric AS value_score
   FROM bulletin.opportunities o JOIN bulletin.decisions d USING(tweet_id)
   JOIN bulletin.allowed_accounts a ON a.account_id=d.account_id
   WHERE (SELECT active FROM bulletin.pipeline_state WHERE id=1)='legacy'
   UNION ALL
   SELECT j.tweet_id,j.content_hash,j.side,j.kind,j.summary,j.evidence,j.topics,j.respond,
     j.standing,j.expires_at,j.place,j.model,j.resolution_state,j.resolution_tweet_id,
     j.resolution_content_hash,j.account_id,j.posted_at,a.username,
     j.p_opportunity,j.p_direct,j.p_joke,j.value_score
   FROM bulletin.jev_items j JOIN bulletin.allowed_accounts a ON a.account_id=j.account_id
   WHERE j.status='ready' AND (SELECT active FROM bulletin.pipeline_state WHERE id=1)='jev'
   ORDER BY posted_at DESC,tweet_id DESC
   LIMIT greatest(0,least(coalesce(max_results,2000),2000))
 ) notice
$$;
REVOKE ALL ON FUNCTION public.get_bulletin_board_state(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_board_state(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_bulletin_runs(before_id bigint DEFAULT NULL, max_results integer DEFAULT 26)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object(
   'runs', coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY page.id::bigint DESC) FROM (
     SELECT r.id::text AS id,r.started_at,r.finished_at,r.status,r.counts,r.model,r.classifier_version,
       r.prompt_version_id::text AS prompt_version_id,p.body AS prompt_body,
       coalesce(c.actual_usd,0) AS actual_usd,coalesce(c.unpriced_reserved_usd,0) AS unpriced_reserved_usd
     FROM bulletin.runs r LEFT JOIN bulletin.prompt_versions p ON p.id=r.prompt_version_id LEFT JOIN LATERAL (
       SELECT sum(actual_usd) AS actual_usd,
         sum(reserved_usd) FILTER (WHERE actual_usd IS NULL) AS unpriced_reserved_usd
       FROM bulletin.calls WHERE run_id=r.id
     ) c ON true
     WHERE before_id IS NULL OR r.id<before_id
     ORDER BY r.id DESC LIMIT greatest(1,least(coalesce(max_results,26),51))
   ) page),'[]'::jsonb),
   'queue', CASE WHEN (SELECT active FROM bulletin.pipeline_state WHERE id=1)='jev'
     THEN (SELECT jsonb_build_object(
       'pending',count(*) FILTER (WHERE status='pending'),
       'retrying',count(*) FILTER (WHERE status='failed' AND attempts<3),
       'exhausted',count(*) FILTER (WHERE status='failed' AND attempts>=3)) FROM bulletin.jev_items)
     ELSE (SELECT jsonb_build_object(
       'pending',count(*) FILTER (WHERE status='pending'),
       'retrying',count(*) FILTER (WHERE status='failed' AND attempts<3),
       'exhausted',count(*) FILTER (WHERE status='failed' AND attempts>=3)) FROM bulletin.decisions) END,
   'last_success_at',(SELECT last_success_at FROM bulletin.worker_state WHERE id=1)
 )
$$;
REVOKE ALL ON FUNCTION public.get_bulletin_runs(bigint,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_runs(bigint,integer) TO service_role;
