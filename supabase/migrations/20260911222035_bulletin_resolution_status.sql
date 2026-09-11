-- Private derived availability: retain only a source ID/hash, not reply text.
ALTER TABLE bulletin.opportunities
  ADD COLUMN resolution_state text NOT NULL DEFAULT 'unknown'
    CHECK (resolution_state IN ('unknown','open','resolved')),
  ADD COLUMN resolution_tweet_id text,
  ADD COLUMN resolution_content_hash text,
  ADD COLUMN context_digest text,
  ADD COLUMN context_checked_at timestamptz,
  ADD CONSTRAINT bulletin_resolution_evidence CHECK (
    (resolution_state='unknown' AND resolution_tweet_id IS NULL AND resolution_content_hash IS NULL)
    OR (resolution_state IN ('open','resolved') AND resolution_tweet_id ~ '^[0-9]{1,20}$'
      AND resolution_content_hash ~ '^[0-9a-f]{64}$'
      AND resolution_tweet_id IS NOT NULL AND resolution_content_hash IS NOT NULL));
CREATE INDEX bulletin_resolution_recheck_idx
  ON bulletin.opportunities(context_checked_at NULLS FIRST,tweet_id);
-- get_bulletin_board_state already returns o.* as JSON. Existing private RLS
-- and service-role grants apply; there is no new browser-accessible RPC.
