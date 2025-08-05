CREATE TABLE IF NOT EXISTS public.mentioned_users (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    screen_name TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_mentioned_users_user_id" ON "public"."mentioned_users" USING "btree" ("user_id");