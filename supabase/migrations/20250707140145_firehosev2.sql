
BEGIN;

-- Only alter the table if the column doesn't already have the default
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'mentioned_users' 
        AND column_name = 'updated_at' 
        AND column_default = 'CURRENT_TIMESTAMP'
    ) THEN
        ALTER TABLE public.mentioned_users 
        ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

COMMIT;

BEGIN;

-- Create table only if it doesn't exist
CREATE TABLE IF NOT EXISTS private.tweet_user (
    tweet_id text not null,
    user_id text not null,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    primary key (tweet_id)
);

-- Insert data only if the table has less than 10k records (indicating it hasn't been populated yet)
DO $$
BEGIN
    -- Check if table has 10k or more records efficiently (stops at row 10000)
    IF NOT EXISTS (SELECT 1 FROM private.tweet_user OFFSET 9999 LIMIT 1) THEN
        INSERT INTO private.tweet_user (tweet_id, user_id, created_at)
        SELECT tweet_id, 'system', created_at
        FROM public.tweets 
        ORDER BY tweet_id ASC;
    END IF;
END $$;

COMMIT;

-- Create table only if it doesn't exist
CREATE TABLE IF NOT EXISTS private.user_intercepted_stats (
    user_id text not null,
    date date not null,
    type text not null,
    count int not null,
    primary key (user_id, date, type)
);

create or replace function tes.get_user_intercepted_stats(days_back int default 30)
returns table (
    date date,
    type text,
    count int
)
language plpgsql
security definer
as $$
declare
    current_user_id text;
begin
    -- Get the current authenticated user's account_id
    SELECT auth.jwt() -> 'user_metadata' ->> 'sub' into current_user_id ;
    
    -- Verify user is authenticated
    if current_user_id is null then
        raise exception 'User must be authenticated';
    end if;
    
    -- Return data only for the authenticated user within the specified date range
    return query
    select 
        uis.date,
        uis.type,
        uis.count
    from private.user_intercepted_stats uis
    where uis.user_id = current_user_id
      and uis.date >= current_date - interval '1 day' * days_back
    order by uis.date desc, uis.type;
end;
$$;


-- CREATE BUCKETS

-- Create public firehose bucket only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'firehose') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
          'firehose',
          'firehose', 
          true,
          null,
          null
        );
    END IF;
END $$;

-- Create private firehose_private bucket only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'firehose_private') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
          'firehose_private',
          'firehose_private',
          false,
          null,
          null
        );
    END IF;
END $$;