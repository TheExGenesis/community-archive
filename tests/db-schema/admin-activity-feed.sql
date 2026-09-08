-- Run only against a fresh disposable Postgres database, never staging or production:
-- psql "$ACTIVITY_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
--   -f tests/db-schema/fixtures/admin-activity-setup.sql \
--   -f supabase/migrations/20260908011039_admin_activity_feed.sql \
--   -f tests/db-schema/admin-activity-feed.sql
-- The assertions roll back their fixture rows.
BEGIN;
INSERT INTO public.archive_upload(id,created_at,account_id,username,upload_phase)
SELECT n, '2026-09-01 12:00:00.123456+00'::timestamptz, n::text, 'upload_'||n, 'completed' FROM generate_series(1,70) n;
INSERT INTO public.optin(id,username,twitter_user_id,opted_in,explicit_optout,opted_out_at,created_at)
VALUES ('00000000-0000-0000-0000-000000000001','older_optout','101',false,true,'2026-04-04','2026-01-01'),
 ('00000000-0000-0000-0000-000000000002','legacy_optout','102',false,true,null,'2026-04-03'),
 ('00000000-0000-0000-0000-000000000003','undated_optout','103',false,true,null,null),
 ('00000000-0000-0000-0000-000000000004','conflicting_consent','104',true,true,'2026-04-02','2026-01-01'),
 ('00000000-0000-0000-0000-000000000005','member','105',true,false,null,'2026-04-01');
INSERT INTO private.admin_jobs(key,job_name,status,created_at,args) VALUES
 ('00000000-0000-0000-0000-000000000006','admin_delete_with_export','QUEUED','2026-08-01','{"username":"older_optout","account_id":"101"}');
INSERT INTO public.user_action_log(id,account_id,action_type,created_at,metadata) VALUES
 (1,'101','delete_archive','2026-07-01','{}'),
 (2,'1','archive_upload','2026-09-01','{"archive_upload_id":1}'),
 (3,'101','archive_upload','2026-06-01','{"archive_upload_id":999}'),
 (4,'101','opt_in','2026-01-01','{}'),
 (5,'101','opt_out_only','2026-04-04','{}');
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE p record; last_at timestamptz; last_id text; seen text[] := '{}'; count_page int; all_ids text[];
BEGIN
  LOOP
    count_page := 0;
    FOR p IN SELECT * FROM public.admin_activity_page(last_at,last_id,NULL,'',13) LOOP
      IF p.id = ANY(seen) THEN RAISE EXCEPTION 'Duplicate event %',p.id; END IF;
      seen := array_append(seen,p.id); last_at := p.occurred_at; last_id := p.id; count_page := count_page+1;
    END LOOP;
    EXIT WHEN count_page=0;
  END LOOP;
  IF cardinality(seen) <> 80 THEN RAISE EXCEPTION 'Expected all 80 records, got %',cardinality(seen); END IF;
  IF last_id <> 'optout:00000000-0000-0000-0000-000000000003' THEN RAISE EXCEPTION 'Undated row missing'; END IF;
  SELECT array_agg(id) INTO all_ids FROM public.admin_activity_page(NULL,NULL,'opt_out','',51);
  IF cardinality(all_ids) <> 5 THEN RAISE EXCEPTION 'Opt-out filter incorrect'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_activity_page(NULL,NULL,'opt_in','conflicting_consent')) THEN RAISE EXCEPTION 'Opt-out did not take precedence'; END IF;
  IF (SELECT count(*) FROM public.admin_activity_page(NULL,NULL,'opt_out','@older_optout')) <> 2 THEN RAISE EXCEPTION 'Older account search failed'; END IF;
  IF (SELECT count(*) FROM public.admin_activity_page(NULL,NULL,NULL,'101')) <> 6 THEN RAISE EXCEPTION 'Account ID search failed'; END IF;
  IF (SELECT count(*) FROM public.admin_activity_page(NULL,NULL,NULL,'',999)) <> 51 THEN RAISE EXCEPTION 'Limit not bounded'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_activity_page(NULL,NULL,NULL,'%',51)) THEN RAISE EXCEPTION 'Search wildcard escaped into filter'; END IF;
  IF has_function_privilege('anon','public.admin_activity_page(timestamptz,text,text,text,integer)','EXECUTE') OR has_function_privilege('authenticated','public.admin_activity_page(timestamptz,text,text,text,integer)','EXECUTE') THEN RAISE EXCEPTION 'Function is publicly executable'; END IF;
END $$;
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$ BEGIN
  PERFORM public.admin_activity_page();
  RAISE EXCEPTION 'Untrusted role was accepted';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
ROLLBACK;
