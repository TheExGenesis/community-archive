-- Additive, private Bulletin storage. No browser role receives access.
CREATE SCHEMA bulletin;

CREATE TABLE bulletin.decisions (
  tweet_id text PRIMARY KEY REFERENCES public.tweets(tweet_id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','positive','negative','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bulletin_pending_idx ON bulletin.decisions(updated_at)
  WHERE status IN ('pending','failed');

CREATE TABLE bulletin.opportunities (
  tweet_id text PRIMARY KEY REFERENCES bulletin.decisions(tweet_id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  side text NOT NULL CHECK (side IN ('ask','offer')),
  kind text NOT NULL CHECK (kind IN ('help','feedback','intro','free','invite','opportunity')),
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
  evidence text NOT NULL CHECK (length(evidence)>0),
  topics text[] NOT NULL,
  respond text NOT NULL CHECK (respond IN ('dm','reply','link','like','unknown')),
  standing boolean NOT NULL,
  expires_at date,
  place text,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Usage survives tweet deletion; it contains no tweet IDs, text or author data.
CREATE TABLE bulletin.calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  reserved_usd numeric NOT NULL CHECK (reserved_usd>=0),
  actual_usd numeric CHECK (actual_usd>=0),
  status text NOT NULL DEFAULT 'reserved'
);
CREATE INDEX bulletin_calls_created_idx ON bulletin.calls(created_at);

CREATE TABLE bulletin.worker_state (
  id integer PRIMARY KEY CHECK (id=1),
  cursor_at timestamptz NOT NULL DEFAULT now()-interval '1 day',
  cursor_id text NOT NULL DEFAULT '',
  scan_until timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  status text NOT NULL DEFAULT 'not_started',
  counts jsonb NOT NULL DEFAULT '{}'
);
INSERT INTO bulletin.worker_state(id) VALUES (1);

CREATE VIEW bulletin.allowed_accounts AS
SELECT DISTINCT a.account_id,a.username
FROM public.user_directory d JOIN public.all_account a USING (account_id)
WHERE NOT a.is_tombstone
 AND NOT EXISTS (SELECT 1 FROM public.optin o WHERE o.explicit_optout IS TRUE
   AND (o.twitter_user_id=a.account_id OR lower(ltrim(o.username,'@'))=lower(a.username)))
 AND NOT EXISTS (SELECT 1 FROM tes.blocked_scraping_users b
   WHERE b.account_id=a.account_id OR lower(ltrim(b.username,'@'))=lower(a.username));

-- Backend-only read path: always recheck current policy, source content and expiry.
CREATE FUNCTION public.get_bulletin_opportunities(max_results integer DEFAULT 50)
RETURNS TABLE(tweet_id text,account_id text,username text,posted_at timestamptz,
  full_text text,side text,kind text,summary text,evidence text,topics text[],
  respond text,standing boolean,expires_at date,place text,model text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$
 SELECT t.tweet_id,t.account_id,a.username,t.created_at,t.full_text,
   o.side,o.kind,o.summary,o.evidence,o.topics,o.respond,o.standing,o.expires_at,o.place,o.model
 FROM bulletin.opportunities o JOIN public.tweets t USING (tweet_id)
 JOIN bulletin.allowed_accounts a ON a.account_id=t.account_id
 WHERE NOT t.is_tombstone AND t.reply_to_tweet_id IS NULL
   AND t.full_text NOT LIKE 'RT @%'
   AND NOT EXISTS (SELECT 1 FROM public.retweets r WHERE r.tweet_id=t.tweet_id)
   AND o.content_hash=encode(sha256(convert_to(t.full_text,'UTF8')),'hex')
   AND (o.expires_at IS NULL OR o.expires_at >= (now() AT TIME ZONE 'UTC')::date)
   AND (o.standing OR o.expires_at IS NOT NULL OR t.created_at >= now()-interval '30 days')
 ORDER BY t.created_at DESC,t.tweet_id DESC
 LIMIT greatest(0,least(coalesce(max_results,50),200))
$$;

ALTER TABLE bulletin.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin.worker_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA bulletin FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA bulletin FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA bulletin FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA bulletin TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA bulletin TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA bulletin TO service_role;
REVOKE ALL ON FUNCTION public.get_bulletin_opportunities(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_opportunities(integer) TO service_role;
