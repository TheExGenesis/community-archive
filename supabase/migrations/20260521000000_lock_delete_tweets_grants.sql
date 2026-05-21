-- Lock down public.delete_tweets to service_role only.
--
-- Background: the function is SECURITY DEFINER (runs as postgres, bypasses
-- RLS) and has no per-tweet ownership/JWT check inside the body. The
-- original schema (20250910105058_remote_schema.sql:9965-9967) granted
-- EXECUTE to anon and authenticated. Combined with the SECURITY DEFINER
-- escalation, this meant anyone holding the public anon key (shipped in
-- every browser bundle as NEXT_PUBLIC_SUPABASE_ANON_KEY) could call the
-- function via PostgREST RPC and delete arbitrary tweets from the
-- archive — no login required.
--
-- This migration codifies a REVOKE that was applied manually to prod
-- via the Supabase SQL editor on 2026-05-21. Without this in
-- supabase/migrations/, the next staging db reset would silently
-- re-grant the function to anon/authenticated and reintroduce the hole
-- on staging.
--
-- If the function is ever needed again in the future, the replacement
-- should add an ownership check inside the body (verify each tweet's
-- account_id matches auth.jwt()->'app_metadata'->>'provider_id') and
-- only grant EXECUTE to authenticated — same pattern as
-- delete_user_archive / delete_single_archive.

REVOKE ALL ON FUNCTION public.delete_tweets(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_tweets(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.delete_tweets(text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tweets(text[]) TO service_role;
