-- Run only against a fresh, disposable database after applying the migration:
-- psql "$SCRAPER_COUNT_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
--   -f supabase/migrations/20261027033954_scraper_count_read_only.sql \
--   -f tests/db-schema/scraper-count-access.sql
-- All fixture changes are rolled back.
BEGIN;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.scraper_count'::regclass) THEN
    RAISE EXCEPTION 'scraper_count RLS is not enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.scraper_count'::regclass
      AND polcmd = 'r'
      AND 0 = ANY(polroles)
  ) THEN
    RAISE EXCEPTION 'scraper_count has no public read policy';
  END IF;

  IF NOT has_table_privilege('anon', 'public.scraper_count', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.scraper_count', 'SELECT')
     OR NOT has_table_privilege('readclient', 'public.scraper_count', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.scraper_count', 'SELECT') THEN
    RAISE EXCEPTION 'an intended scraper_count read grant is missing';
  END IF;

  IF has_table_privilege('anon', 'public.scraper_count', 'INSERT')
     OR has_table_privilege('anon', 'public.scraper_count', 'UPDATE')
     OR has_table_privilege('anon', 'public.scraper_count', 'DELETE')
     OR has_table_privilege('anon', 'public.scraper_count', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.scraper_count', 'REFERENCES')
     OR has_table_privilege('anon', 'public.scraper_count', 'TRIGGER')
     OR has_table_privilege('authenticated', 'public.scraper_count', 'INSERT')
     OR has_table_privilege('authenticated', 'public.scraper_count', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.scraper_count', 'DELETE')
     OR has_table_privilege('authenticated', 'public.scraper_count', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.scraper_count', 'REFERENCES')
     OR has_table_privilege('authenticated', 'public.scraper_count', 'TRIGGER')
     OR has_table_privilege('readclient', 'public.scraper_count', 'INSERT')
     OR has_table_privilege('readclient', 'public.scraper_count', 'UPDATE')
     OR has_table_privilege('readclient', 'public.scraper_count', 'DELETE')
     OR has_table_privilege('readclient', 'public.scraper_count', 'TRUNCATE')
     OR has_table_privilege('readclient', 'public.scraper_count', 'REFERENCES')
     OR has_table_privilege('readclient', 'public.scraper_count', 'TRIGGER') THEN
    RAISE EXCEPTION 'an untrusted role has scraper_count mutation privileges';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.scraper_count', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.scraper_count', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.scraper_count', 'DELETE') THEN
    RAISE EXCEPTION 'service_role maintenance grants are missing';
  END IF;
END;
$$;

INSERT INTO public.scraper_count (count) VALUES (8675309);

SET LOCAL ROLE readclient;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.scraper_count WHERE count = 8675309) <> 1 THEN
    RAISE EXCEPTION 'readclient cannot read scraper_count';
  END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.scraper_count WHERE count = 8675309) <> 1 THEN
    RAISE EXCEPTION 'anon cannot read scraper_count';
  END IF;
  BEGIN
    INSERT INTO public.scraper_count (count) VALUES (1);
    RAISE EXCEPTION 'anon INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.scraper_count SET count = 1 WHERE count = 8675309;
    RAISE EXCEPTION 'anon UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.scraper_count WHERE count = 8675309;
    RAISE EXCEPTION 'anon DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    TRUNCATE public.scraper_count;
    RAISE EXCEPTION 'anon TRUNCATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.scraper_count WHERE count = 8675309) <> 1 THEN
    RAISE EXCEPTION 'authenticated cannot read scraper_count';
  END IF;
  BEGIN
    INSERT INTO public.scraper_count (count) VALUES (2);
    RAISE EXCEPTION 'authenticated INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.scraper_count SET count = 2 WHERE count = 8675309;
    RAISE EXCEPTION 'authenticated UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.scraper_count WHERE count = 8675309;
    RAISE EXCEPTION 'authenticated DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    TRUNCATE public.scraper_count;
    RAISE EXCEPTION 'authenticated TRUNCATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.scraper_count WHERE count = 8675309) <> 1 THEN
    RAISE EXCEPTION 'a denied client write changed the fixture row';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
UPDATE public.scraper_count SET count = 8675310 WHERE count = 8675309;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.scraper_count WHERE count = 8675310) <> 1 THEN
    RAISE EXCEPTION 'service_role maintenance did not succeed';
  END IF;
END;
$$;

ROLLBACK;
