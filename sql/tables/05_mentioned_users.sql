CREATE TABLE IF NOT EXISTS public.mentioned_users (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    screen_name TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);