-- Make the public PostgREST username ILIKE lookup use an index instead of
-- scanning every row in all_account. The existing btree indexes only serve
-- equality and explicit lower(username) predicates.
--
-- PRODUCTION NOTE: build this index with CREATE INDEX CONCURRENTLY outside the
-- migration transaction before running db push. The IF NOT EXISTS guard then
-- records this migration without rebuilding or locking the live table.
CREATE INDEX IF NOT EXISTS "idx_all_account_username_trgm"
  ON "public"."all_account" USING "gin" ("username" "public"."gin_trgm_ops");
