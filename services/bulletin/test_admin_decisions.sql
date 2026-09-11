-- Run with psql -v ON_ERROR_STOP=1 -f services/bulletin/test_admin_decisions.sql
-- against a disposable, empty local PostgreSQL database only. No live data.
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA bulletin;
CREATE TABLE bulletin.decisions (
 tweet_id text PRIMARY KEY, account_id text, posted_at timestamptz,
 content_hash text, status text, attempts integer DEFAULT 0,
 updated_at timestamptz, last_attempt_at timestamptz, version text
);
CREATE TABLE bulletin.opportunities (
 tweet_id text PRIMARY KEY, content_hash text, summary text, evidence text, side text, kind text
);
-- Fixtures represent the output of the existing authoritative policy view.
CREATE TABLE bulletin.allowed_accounts (account_id text PRIMARY KEY, username text);
GRANT USAGE ON SCHEMA bulletin TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA bulletin TO service_role;
\ir ../../supabase/migrations/20260911204733_bulletin_admin_decisions.sql
INSERT INTO bulletin.allowed_accounts VALUES ('42','member');
INSERT INTO bulletin.decisions(tweet_id,account_id,content_hash,status,updated_at)
VALUES ('101','42','a','positive','2026-09-11 10:00Z'),
 ('102','42','b','negative','2026-09-11 10:00Z'),
 ('103','42','c','failed','2026-09-11 10:00Z'),
 ('104','42','d','pending','2026-09-11 10:00Z'),
 ('105','99','e','positive','2026-09-11 10:00Z');
INSERT INTO bulletin.opportunities VALUES
 ('101','a','Accepted summary','Evidence','ask','help'),
 ('102','b','Stale rejected summary','Evidence','ask','help'),
 ('103','old','Stale failed summary','Evidence','ask','help');
DO $$ BEGIN
 IF has_function_privilege('anon','public.get_bulletin_decisions(text,timestamptz,text,integer,text)','execute')
   OR has_function_privilege('authenticated','public.get_bulletin_decisions(text,timestamptz,text,integer,text)','execute')
 THEN RAISE EXCEPTION 'browser roles must not execute'; END IF;
END $$;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF jsonb_array_length(public.get_bulletin_decisions())<>4 THEN RAISE EXCEPTION 'policy filtering'; END IF;
 IF public.get_bulletin_decisions('positive')->0->>'summary'<>'Accepted summary' THEN RAISE EXCEPTION 'positive label'; END IF;
 IF public.get_bulletin_decisions('negative')->0->>'summary' IS NOT NULL THEN RAISE EXCEPTION 'stale label leak'; END IF;
 IF public.get_bulletin_decisions('failed')->0->>'summary' IS NOT NULL THEN RAISE EXCEPTION 'failed label leak'; END IF;
 IF public.get_bulletin_decisions(NULL,'2026-09-11 10:00Z','103')->0->>'tweet_id'<>'102' THEN RAISE EXCEPTION 'cursor tie'; END IF;
 IF jsonb_array_length(public.get_bulletin_decisions(max_results=>2))<>2 THEN RAISE EXCEPTION 'page bound'; END IF;
 IF public.get_bulletin_decisions(selected_tweet_id=>'105')<>'[]'::jsonb THEN RAISE EXCEPTION 'single lookup policy'; END IF;
 IF public.get_bulletin_decisions('invalid')<>'[]'::jsonb THEN RAISE EXCEPTION 'invalid status'; END IF;
END $$;
RESET ROLE;
DELETE FROM bulletin.allowed_accounts WHERE account_id='42';
DO $$ BEGIN
 IF public.get_bulletin_decisions()<>'[]'::jsonb THEN RAISE EXCEPTION 'revoked policy'; END IF;
END $$;
ROLLBACK;
