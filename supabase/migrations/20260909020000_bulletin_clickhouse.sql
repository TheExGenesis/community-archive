-- ClickHouse owns tweet reads; PostgreSQL retains derived website/job state.
ALTER TABLE bulletin.decisions DROP CONSTRAINT decisions_tweet_id_fkey;
ALTER TABLE bulletin.decisions ADD COLUMN account_id text, ADD COLUMN posted_at timestamptz;
CREATE TABLE bulletin.scans (
  scan_key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  cursor_id text NOT NULL DEFAULT '0',
  complete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end>window_start AND window_end-window_start<=interval '15 days')
);
CREATE OR REPLACE FUNCTION public.get_bulletin_board_state(max_results integer DEFAULT 2000)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(notice) ORDER BY notice.posted_at DESC,notice.tweet_id DESC),'[]'::jsonb)
 FROM (
   SELECT o.*,d.account_id,d.posted_at,a.username
   FROM bulletin.opportunities o JOIN bulletin.decisions d USING(tweet_id)
   JOIN bulletin.allowed_accounts a ON a.account_id=d.account_id
   ORDER BY d.posted_at DESC,o.tweet_id DESC
   LIMIT greatest(0,least(coalesce(max_results,2000),2000))
 ) notice
$$;
ALTER TABLE bulletin.scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulletin.scans FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON bulletin.scans TO service_role;
REVOKE ALL ON FUNCTION public.get_bulletin_board_state(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_board_state(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_bulletin_relationships(viewer_username text DEFAULT NULL, viewer_account_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH viewer AS MATERIALIZED (
   SELECT account_id,username FROM bulletin.allowed_accounts
   WHERE (viewer_account_id IS NOT NULL AND account_id=viewer_account_id)
      OR (viewer_account_id IS NULL AND lower(username)=lower(viewer_username)) LIMIT 1
 ), outgoing AS (
   SELECT f.following_account_id AS account_id FROM public.following f JOIN viewer v ON v.account_id=f.account_id
   UNION
   SELECT f.account_id FROM public.followers f JOIN viewer v ON v.account_id=f.follower_account_id
 ), incoming AS (
   SELECT f.follower_account_id AS account_id FROM public.followers f JOIN viewer v ON v.account_id=f.account_id
   UNION
   SELECT f.account_id FROM public.following f JOIN viewer v ON v.account_id=f.following_account_id
 )
 SELECT jsonb_build_object('account_id',v.account_id,'username',v.username,'available',true,
   'following',(SELECT coalesce(jsonb_agg(a.account_id),'[]'::jsonb) FROM outgoing o JOIN bulletin.allowed_accounts a USING(account_id)),
   'followers',(SELECT coalesce(jsonb_agg(a.account_id),'[]'::jsonb) FROM incoming i JOIN bulletin.allowed_accounts a USING(account_id))) FROM viewer v
$$;
REVOKE ALL ON FUNCTION public.get_bulletin_relationships(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_relationships(text,text) TO service_role;
