-- Ask the archive: a member may share a conversation. A row here makes the
-- conversation readable by anyone with its link, signed in or not, as long
-- as every run in it belongs to account_id; removing the row stops sharing,
-- and deleting the conversation removes it too. Service role only, like
-- agent_search_runs: the server checks ownership in route code.
CREATE TABLE IF NOT EXISTS "public"."agent_search_shared_conversations" (
    "conversation_id" text PRIMARY KEY CHECK (length("conversation_id") <= 100),
    "account_id" text NOT NULL,
    "shared_at" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "public"."agent_search_shared_conversations" OWNER TO "postgres";

-- Deleting all of a member's history removes their shares.
CREATE INDEX IF NOT EXISTS "agent_search_shared_conversations_account_idx"
  ON "public"."agent_search_shared_conversations" ("account_id");

ALTER TABLE "public"."agent_search_shared_conversations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."agent_search_shared_conversations" FROM "anon", "authenticated";
GRANT ALL PRIVILEGES ON TABLE "public"."agent_search_shared_conversations" TO "service_role";
