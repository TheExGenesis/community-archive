-- Immediate, reversible serving boundary for the universal tombstone rollout.
-- This migration deliberately avoids historical table scans: it makes unsafe
-- object/snapshot paths private while the bounded reconciliation is running.

SET lock_timeout TO '5s';
SET statement_timeout TO '30s';

UPDATE storage.buckets
SET public = false
WHERE id IN ('archives', 'enriched_tweets');

DROP POLICY IF EXISTS "Archives are publicly readable" ON storage.objects;

REVOKE ALL ON TABLE public.account_activity_summary
  FROM PUBLIC, anon, authenticated, readclient;

REVOKE EXECUTE ON FUNCTION tes.search_liked_tweets(
  text, text, text, date, date, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;

RESET statement_timeout;
RESET lock_timeout;
