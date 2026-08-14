alter table "public"."digest_runs"
  add column "workflow_run_id" text;

create unique index "digest_runs_workflow_run_id_key"
  on "public"."digest_runs" ("workflow_run_id")
  where "workflow_run_id" is not null;

comment on column "public"."digest_runs"."workflow_run_id" is
  'Vercel Workflow run that durably executes this generation after the initiating request returns.';
