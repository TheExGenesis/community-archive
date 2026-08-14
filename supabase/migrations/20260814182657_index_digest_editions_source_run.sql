-- Cover the edition-to-run foreign key and the editorial lab's draft lookup.
create index "digest_editions_source_run_idx"
  on "public"."digest_editions" ("source_run_id", "version" desc);
