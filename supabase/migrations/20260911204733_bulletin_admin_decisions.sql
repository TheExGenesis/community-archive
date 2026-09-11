CREATE INDEX bulletin_decisions_recent_idx ON bulletin.decisions(updated_at DESC,tweet_id DESC);
CREATE INDEX bulletin_decisions_status_recent_idx ON bulletin.decisions(status,updated_at DESC,tweet_id DESC);
-- Read-only, server-only decision inspection. Live tweet text is hydrated separately.
CREATE FUNCTION public.get_bulletin_decisions(
  decision_status text DEFAULT NULL,
  before_updated_at timestamptz DEFAULT NULL,
  before_tweet_id text DEFAULT NULL,
  max_results integer DEFAULT 26,
  selected_tweet_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY row.updated_at DESC,row.tweet_id DESC),'[]'::jsonb)
 FROM (
   SELECT d.tweet_id,d.account_id,d.posted_at,d.content_hash,d.status,d.attempts,
     d.updated_at,d.last_attempt_at,d.version,a.username,
     o.summary,o.evidence,o.side,o.kind
   FROM bulletin.decisions d
   JOIN bulletin.allowed_accounts a ON a.account_id=d.account_id
   LEFT JOIN bulletin.opportunities o ON o.tweet_id=d.tweet_id
     AND o.content_hash=d.content_hash AND d.status='positive'
   WHERE (decision_status IS NULL OR d.status=decision_status)
     AND (selected_tweet_id IS NULL OR d.tweet_id=selected_tweet_id)
     AND ((before_updated_at IS NULL AND before_tweet_id IS NULL)
       OR (d.updated_at,d.tweet_id)<(before_updated_at,before_tweet_id))
   ORDER BY d.updated_at DESC,d.tweet_id DESC
   LIMIT greatest(0,least(coalesce(max_results,26),26))
 ) row
$$;
REVOKE ALL ON FUNCTION public.get_bulletin_decisions(text,timestamptz,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_decisions(text,timestamptz,text,integer,text) TO service_role;
