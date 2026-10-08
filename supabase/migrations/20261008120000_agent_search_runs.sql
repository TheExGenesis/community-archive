-- One row per agentic search question, keyed by its workflow run id. Private
-- to the asker: only the server's service-role client reads or writes it, and
-- route code checks ownership. Also backs the per-member and global budgets.
create table if not exists "public"."agent_search_runs" (
    "id" text primary key,
    "account_id" text not null,
    "conversation_id" text check (length("conversation_id") <= 100),
    "question" text not null check (length("question") <= 1000),
    "status" text not null check ("status" in ('running', 'completed', 'failed')),
    "model" text not null,
    "started_at" timestamptz not null default now(),
    "completed_at" timestamptz,
    "answer" text,
    "cited_tweet_ids" text[] not null default '{}',
    "invalid_citation_ids" text[] not null default '{}',
    "tool_calls" jsonb not null default '[]'::jsonb,
    "input_tokens" integer not null default 0,
    "output_tokens" integer not null default 0,
    "cost_usd" numeric not null default 0,
    "error" text,
    -- The answer's message parts with tweets reduced to ids; tweets are
    -- fetched again through the gateway when a past answer is opened.
    "parts" jsonb
);
alter table "public"."agent_search_runs" owner to "postgres";

-- Per-member daily counts and history, and the global daily cost total.
create index if not exists "agent_search_runs_account_started_idx"
  on "public"."agent_search_runs" ("account_id", "started_at" desc);
create index if not exists "agent_search_runs_started_idx"
  on "public"."agent_search_runs" ("started_at");
create index if not exists "agent_search_runs_conversation_idx"
  on "public"."agent_search_runs" ("conversation_id", "started_at");

-- No user policies: runs are read and written only by the server's
-- service-role client, which checks ownership in route code.
alter table "public"."agent_search_runs" enable row level security;

revoke all privileges on table "public"."agent_search_runs" from "anon", "authenticated";
grant all privileges on table "public"."agent_search_runs" to "service_role";
