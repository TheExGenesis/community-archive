-- Indexes for materialized views

-- public.global_activity_summary
CREATE UNIQUE INDEX "idx_global_activity_summary_last_updated" ON "public"."global_activity_summary" USING "btree" ("last_updated");

-- public.monthly_tweet_counts_mv
CREATE INDEX "monthly_tweet_counts_mv_account_idx" ON "public"."monthly_tweet_counts_mv" USING "btree" ("account_id");
CREATE INDEX "monthly_tweet_counts_mv_month_idx" ON "public"."monthly_tweet_counts_mv" USING "btree" ("month" DESC);
CREATE UNIQUE INDEX "monthly_tweet_counts_mv_unique_idx" ON "public"."monthly_tweet_counts_mv" USING "btree" ("month", "account_id");

