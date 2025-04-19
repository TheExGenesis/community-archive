CREATE TABLE IF NOT EXISTS public.all_account (LIKE public.account INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.all_profile (
    account_id TEXT PRIMARY KEY, 
    bio TEXT,
    website TEXT,
    location TEXT,
    avatar_media_url TEXT,
    header_media_url TEXT,
    archive_upload_id BIGINT NOT NULL,
    UNIQUE (account_id, archive_upload_id),
    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (account_id) REFERENCES public.all_account (account_id)
);
CREATE INDEX IF NOT EXISTS "idx_all_profile_archive_upload_id" ON "public"."all_profile" USING "btree" ("archive_upload_id");
SELECT public.apply_public_rls_policies_not_private('public', 'all_account');
SELECT public.apply_public_rls_policies_not_private('public', 'all_profile');
 -- Then copy data
INSERT INTO public.all_account 
SELECT * FROM public.account;
INSERT INTO public.all_profile (account_id, bio, website, location, avatar_media_url, header_media_url, archive_upload_id)
SELECT p.account_id, bio, website, location, avatar_media_url, header_media_url, archive_upload_id FROM public.profile p
    INNER JOIN (
    SELECT account_id, MAX(archive_upload_id) as latest_archive_id
    FROM public.profile
    GROUP BY account_id
) latest ON p.account_id = latest.account_id 
    AND p.archive_upload_id = latest.latest_archive_id;
 -- Public Schema
CREATE OR REPLACE FUNCTION update_foreign_keys(
    old_table_name text,
    new_table_name text,
    schema_name text
) RETURNS void AS $$
DECLARE
    constraint_record record;
BEGIN
    -- Begin transaction
    BEGIN
        FOR constraint_record IN 
            SELECT 
                tc.table_name,
                tc.constraint_name,
                kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND ccu.table_name = old_table_name
                AND tc.table_schema = schema_name
                --AND tc.table_name != 'archive_upload'  -- Skip archive_upload table
        LOOP
            -- Drop old constraint
            EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
                schema_name,
                constraint_record.table_name,
                constraint_record.constraint_name
            );
            -- Add new constraint without validation
            EXECUTE format(
                'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(%I) NOT VALID',
                schema_name,
                constraint_record.table_name,
                constraint_record.constraint_name,
                constraint_record.column_name,
                schema_name,
                new_table_name,
                constraint_record.column_name
            );
            -- Validate the constraint
            EXECUTE format(
                'ALTER TABLE %I.%I VALIDATE CONSTRAINT %I',
                schema_name,
                constraint_record.table_name,
                constraint_record.constraint_name
            );
            RAISE NOTICE 'Updated foreign key for table: %.%', schema_name, constraint_record.table_name;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        -- If there's an error, rollback everything
        RAISE NOTICE 'Error occurred: %', SQLERRM;
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql;
DO $$
BEGIN
    BEGIN
        DROP MATERIALIZED VIEW IF EXISTS public.account_activity_summary;
        DROP MATERIALIZED VIEW IF EXISTS public.global_activity_summary;
        DROP VIEW IF EXISTS public.enriched_tweets;
        DROP VIEW IF EXISTS public.tweets_enriched;
        --they depend on account
        DROP POLICY "Entities are modifiable by their users" ON liked_tweets;
        DROP POLICY "Entities are modifiable by their users" ON mentioned_users;
        PERFORM  update_foreign_keys('account', 'all_account', 'public');
    EXCEPTION WHEN OTHERS THEN
        -- Roll back any changes made in this transaction
        RAISE EXCEPTION 'Error during migration: %', SQLERRM;
    END;
END $$;
DO $$ 
DECLARE
    account_count INTEGER;
    all_account_count INTEGER;
    table_exists BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO account_count FROM public.account;
    SELECT COUNT(*) INTO all_account_count FROM public.all_account;
    
    -- Check if table exists without using nested DO block
    SELECT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'account'
    ) INTO table_exists;
    
    IF account_count = all_account_count THEN
        -- Drop table if it exists
        IF table_exists THEN
            EXECUTE 'DROP TABLE public.account';
        END IF;
        
        -- Create view
        CREATE OR REPLACE VIEW public.account AS
        SELECT a.*
        FROM all_account a
        INNER JOIN archive_upload au ON a.account_id = au.account_id and au.id = (SELECT MAX(id) FROM archive_upload where account_id = a.account_id);
    ELSE
        RAISE EXCEPTION 'Table counts do not match: account has % rows, all_account has % rows', 
            account_count, all_account_count;
    END IF;
END $$;
DO $$ 
DECLARE
    profile_count INTEGER;
    all_profile_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO profile_count FROM public.profile p
           INNER JOIN (
           SELECT account_id, MAX(archive_upload_id) as latest_archive_id
           FROM public.profile
           GROUP BY account_id
       ) latest ON p.account_id = latest.account_id 
           AND p.archive_upload_id = latest.latest_archive_id;
    SELECT COUNT(*) INTO all_profile_count FROM public.all_profile;
    IF profile_count = all_profile_count THEN
        IF EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE schemaname = 'public' AND tablename = 'profile'
        ) THEN
            DROP TABLE public.profile;
        END IF;
        CREATE OR REPLACE VIEW public.profile AS
        SELECT  
            p.*
        FROM all_profile p
        INNER JOIN archive_upload au ON p.account_id = au.account_id and au.id = (SELECT MAX(id) FROM archive_upload where account_id = p.account_id); 
    ELSE
        RAISE EXCEPTION 'Table counts do not match: profile has % rows, all_profile has % rows', 
            profile_count, all_profile_count;
    END IF;
END $$;
--reapply policies
CREATE POLICY "Entities are modifiable by their users" ON "public"."liked_tweets" TO "authenticated" USING ((EXISTS ( SELECT 1
    FROM "public"."account" "dt"
    WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
    FROM "public"."account" "dt"
    WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))));
CREATE POLICY "Entities are modifiable by their users" ON "public"."mentioned_users" TO "authenticated" USING ((EXISTS ( SELECT 1
    FROM "public"."all_account" "dt"
    WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
    FROM "public"."all_account" "dt"
    WHERE ("dt"."account_id" = ((( SELECT "auth"."jwt"() AS "jwt") -> 'app_metadata'::"text") ->> 'provider_id'::"text")))));

--UPDATE OLD FUNCTIONS TO USE ALL_ACCOUNT
CREATE OR REPLACE FUNCTION public.commit_temp_data(p_suffix TEXT)
RETURNS VOID AS $$
DECLARE
    v_archive_upload_id BIGINT;
    v_account_id TEXT;
    v_archive_at TIMESTAMP WITH TIME ZONE;
    v_keep_private BOOLEAN;
    v_upload_likes BOOLEAN;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    RAISE NOTICE 'commit_temp_data called with suffix: %', p_suffix;
    -- 1. Insert account data first
    EXECUTE format('
        INSERT INTO public.all_account (
            created_via, username, account_id, created_at, account_display_name,
            num_tweets, num_following, num_followers, num_likes
        )
        SELECT 
            created_via, username, account_id, created_at, account_display_name,
            num_tweets, num_following, num_followers, num_likes
        FROM temp.account_%s
        ON CONFLICT (account_id) DO UPDATE SET
            username = EXCLUDED.username,
            account_display_name = EXCLUDED.account_display_name,
            created_via = EXCLUDED.created_via,
            created_at = EXCLUDED.created_at,
            num_tweets = EXCLUDED.num_tweets,
            num_following = EXCLUDED.num_following,
            num_followers = EXCLUDED.num_followers,
            num_likes = EXCLUDED.num_likes
        RETURNING account_id
    ', p_suffix) INTO v_account_id;
    -- 2. Get the latest archive upload data from temp.archive_upload
    EXECUTE format('
        SELECT archive_at, keep_private, upload_likes, start_date, end_date
        FROM temp.archive_upload_%s
        ORDER BY archive_at DESC
        LIMIT 1
    ', p_suffix) INTO v_archive_at, v_keep_private, v_upload_likes, v_start_date, v_end_date;
    -- 3. Insert or update archive_upload and get the ID
    INSERT INTO public.archive_upload (
        account_id, 
        archive_at, 
        created_at, 
        keep_private, 
        upload_likes, 
        start_date, 
        end_date,
        upload_phase
    )
    VALUES (
        v_account_id, 
        v_archive_at, 
        CURRENT_TIMESTAMP, 
        v_keep_private, 
        v_upload_likes, 
        v_start_date, 
        v_end_date,
        'uploading'
    )
    ON CONFLICT (account_id, archive_at)
    DO UPDATE SET
        account_id = EXCLUDED.account_id,
        created_at = CURRENT_TIMESTAMP,
        keep_private = EXCLUDED.keep_private,
        upload_likes = EXCLUDED.upload_likes,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        upload_phase = 'uploading'
    RETURNING id INTO v_archive_upload_id;
    -- Insert profile data
    EXECUTE format('
        INSERT INTO public.all_profile (bio, website, location, avatar_media_url, header_media_url, account_id, archive_upload_id)
        SELECT p.bio, p.website, p.location, p.avatar_media_url, p.header_media_url, p.account_id, $1
        FROM temp.profile_%s p
        ON CONFLICT (account_id) DO UPDATE SET
            bio = EXCLUDED.bio,
            website = EXCLUDED.website,
            location = EXCLUDED.location,
            avatar_media_url = EXCLUDED.avatar_media_url,
            header_media_url = EXCLUDED.header_media_url,
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    -- Insert tweets data
    EXECUTE format('
        INSERT INTO public.tweets (tweet_id, account_id, created_at, full_text, retweet_count, favorite_count, reply_to_tweet_id, reply_to_user_id, reply_to_username, archive_upload_id)
        SELECT t.tweet_id, t.account_id, t.created_at, t.full_text, t.retweet_count, t.favorite_count, t.reply_to_tweet_id, t.reply_to_user_id, t.reply_to_username, $1
        FROM temp.tweets_%s t
        ON CONFLICT (tweet_id) DO UPDATE SET
            full_text = EXCLUDED.full_text,
            retweet_count = EXCLUDED.retweet_count,
            favorite_count = EXCLUDED.favorite_count,
            reply_to_tweet_id = EXCLUDED.reply_to_tweet_id,
            reply_to_user_id = EXCLUDED.reply_to_user_id,
            reply_to_username = EXCLUDED.reply_to_username,
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    -- Insert tweet_media data
    EXECUTE format('
        INSERT INTO public.tweet_media (media_id, tweet_id, media_url, media_type, width, height, archive_upload_id)
        SELECT tm.media_id, tm.tweet_id, tm.media_url, tm.media_type, tm.width, tm.height, $1
        FROM temp.tweet_media_%s tm
        ON CONFLICT (media_id) DO UPDATE SET
            media_url = EXCLUDED.media_url,
            media_type = EXCLUDED.media_type,
            width = EXCLUDED.width,
            height = EXCLUDED.height,
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    -- Insert mentioned_users data
    EXECUTE format('
        INSERT INTO public.mentioned_users (user_id, name, screen_name, updated_at)
        SELECT user_id, name, screen_name, updated_at
        FROM temp.mentioned_users_%s
        ON CONFLICT (user_id) DO UPDATE SET
            name = EXCLUDED.name,
            screen_name = EXCLUDED.screen_name,
            updated_at = EXCLUDED.updated_at
    ', p_suffix);
    -- Insert user_mentions data
    EXECUTE format('
        INSERT INTO public.user_mentions (mentioned_user_id, tweet_id)
        SELECT um.mentioned_user_id, um.tweet_id
        FROM temp.user_mentions_%s um
        JOIN public.mentioned_users mu ON um.mentioned_user_id = mu.user_id
        JOIN public.tweets t ON um.tweet_id = t.tweet_id
        ON CONFLICT (mentioned_user_id, tweet_id) DO NOTHING
    ', p_suffix);
    -- Insert tweet_urls data
    EXECUTE format('
        INSERT INTO public.tweet_urls (url, expanded_url, display_url, tweet_id)
        SELECT tu.url, tu.expanded_url, tu.display_url, tu.tweet_id
        FROM temp.tweet_urls_%s tu
        JOIN public.tweets t ON tu.tweet_id = t.tweet_id
        ON CONFLICT (tweet_id, url) DO NOTHING
    ', p_suffix);
    -- Insert followers data
    EXECUTE format('
        INSERT INTO public.followers (account_id, follower_account_id, archive_upload_id)
        SELECT f.account_id, f.follower_account_id, $1
        FROM temp.followers_%s f
        ON CONFLICT (account_id, follower_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    -- Insert following data
    EXECUTE format('
        INSERT INTO public.following (account_id, following_account_id, archive_upload_id)
        SELECT f.account_id, f.following_account_id, $1
        FROM temp.following_%s f
        ON CONFLICT (account_id, following_account_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    -- Insert liked_tweets data
    EXECUTE format('
        INSERT INTO public.liked_tweets (tweet_id, full_text)
        SELECT lt.tweet_id, lt.full_text
        FROM temp.liked_tweets_%s lt
        ON CONFLICT (tweet_id) DO NOTHING
    ', p_suffix);
    -- Insert likes data
    EXECUTE format('
        INSERT INTO public.likes (account_id, liked_tweet_id, archive_upload_id)
          SELECT l.account_id, l.liked_tweet_id, $1
        FROM temp.likes_%s l
        ON CONFLICT (account_id, liked_tweet_id) DO UPDATE SET
            archive_upload_id = EXCLUDED.archive_upload_id
    ', p_suffix) USING v_archive_upload_id;
    -- Drop temporary tables after committing
    PERFORM public.drop_temp_tables(p_suffix);
    -- Update upload_phase to 'completed' after successful execution
    UPDATE public.archive_upload
    SET upload_phase = 'completed'
    WHERE id = v_archive_upload_id;
EXCEPTION
    WHEN OTHERS THEN
        -- Update upload_phase to 'failed' if an error occurs
        UPDATE public.archive_upload
        SET upload_phase = 'failed'
        WHERE id = v_archive_upload_id;
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION public.delete_all_archives(p_account_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_schema_name TEXT := 'public';
    v_archive_upload_ids BIGINT[];
BEGIN
    SELECT ARRAY_AGG(id) INTO v_archive_upload_ids
    FROM public.archive_upload
    WHERE account_id = p_account_id;
    BEGIN
        -- Delete tweets and related data
        EXECUTE format('
            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1) OR account_id = $2
            )
            DELETE FROM %I.tweet_media WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);
                WITH tweets_to_delete AS (
                    SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1) 
                )
            DELETE FROM %I.user_mentions WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);
            WITH tweets_to_delete AS (
                SELECT tweet_id FROM %I.tweets WHERE archive_upload_id = ANY($1) OR account_id = $2
            )
            DELETE FROM %I.tweet_urls WHERE tweet_id IN (SELECT tweet_id FROM tweets_to_delete);
            DELETE FROM %I.tweets WHERE archive_upload_id = ANY($1);
        ', v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name)
        USING v_archive_upload_ids, p_account_id;
        -- Delete other related data
        EXECUTE format('
            DELETE FROM %I.likes WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.followers WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.following WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.all_profile WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.tweet_media WHERE archive_upload_id = ANY($1);
            DELETE FROM %I.archive_upload WHERE id = ANY($1);
            DELETE FROM %I.all_account WHERE account_id = $2;
        ', v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name)
        USING v_archive_upload_ids, p_account_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error deleting archives for account %: %', p_account_id, SQLERRM;
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE MATERIALIZED VIEW
  public.global_activity_summary AS
SELECT
  (
    SELECT COUNT(DISTINCT account_id) FROM public.account
  ) AS total_accounts,
  (
    SELECT COUNT(DISTINCT tweet_id) FROM public.tweets
  ) AS total_tweets,
  (
    SELECT COUNT(DISTINCT liked_tweet_id) FROM public.likes
  ) AS total_likes,
  (
    SELECT COUNT(DISTINCT tweet_id) FROM public.user_mentions
  ) AS total_user_mentions,
  (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT * FROM public.get_top_mentioned_users(30)
    ) t
  ) AS top_mentioned_users,
  (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT * FROM public.get_top_accounts_with_followers(10)
    ) t
  ) AS top_accounts_with_followers,
  CURRENT_TIMESTAMP AS last_updated;
-- Add a unique index on the last_updated column
CREATE UNIQUE INDEX idx_global_activity_summary_last_updated 
ON public.global_activity_summary (last_updated);
CREATE MATERIALIZED VIEW public.account_activity_summary AS
WITH account_mentions AS (
  SELECT 
    t.account_id,
    um.mentioned_user_id,
    COUNT(*) as mention_count
  FROM public.tweets t
  JOIN public.user_mentions um ON t.tweet_id = um.tweet_id
  GROUP BY t.account_id, um.mentioned_user_id
),
top_tweets AS (
  SELECT 
    account_id,
    json_agg(
      json_build_object(
        'tweet_id', tweet_id,
        'account_id', account_id,
        'created_at', created_at,
        'full_text', full_text,
        'retweet_count', retweet_count,
        'favorite_count', favorite_count,
        'reply_to_tweet_id', reply_to_tweet_id,
        'reply_to_user_id', reply_to_user_id,
        'reply_to_username', reply_to_username,
        'archive_upload_id', archive_upload_id
      ) ORDER BY retweet_count DESC
    ) FILTER (WHERE retweet_count > 0 AND rt_rank <= 100) as most_retweeted_tweets,
    json_agg(
      json_build_object(
        'tweet_id', tweet_id,
        'account_id', account_id,
        'created_at', created_at,
        'full_text', full_text,
        'retweet_count', retweet_count,
        'favorite_count', favorite_count,
        'reply_to_tweet_id', reply_to_tweet_id,
        'reply_to_user_id', reply_to_user_id,
        'reply_to_username', reply_to_username,
        'archive_upload_id', archive_upload_id
      ) ORDER BY favorite_count DESC
    ) FILTER (WHERE favorite_count > 0 AND fav_rank <= 100) as most_favorited_tweets
  FROM (
    SELECT 
      *,
      ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY retweet_count DESC) as rt_rank,
      ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY favorite_count DESC) as fav_rank
    FROM public.tweets
  ) t
  GROUP BY account_id
),
mentioned_accounts AS (
  SELECT 
    am.account_id,
    json_agg(
      json_build_object(
        'user_id', am.mentioned_user_id,
        'name', mu.name,
        'screen_name', mu.screen_name,
        'mention_count', am.mention_count
      ) ORDER BY am.mention_count DESC
    ) FILTER (WHERE am.mention_count > 0 AND mention_rank <= 20) as mentioned_accounts
  FROM (
    SELECT 
      *,
      ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY mention_count DESC) as mention_rank
    FROM account_mentions
  ) am
  LEFT JOIN public.mentioned_users mu ON mu.user_id = am.mentioned_user_id
  GROUP BY am.account_id
)
SELECT
  a.account_id,
  a.username,
  a.num_tweets,
  a.num_followers,
  COALESCE((
    SELECT COUNT(*)
    FROM public.likes l 
    WHERE l.account_id = a.account_id
  ), 0) AS total_likes,
  COALESCE((
    SELECT COUNT(*)
    FROM public.user_mentions um 
    JOIN public.tweets t ON um.tweet_id = t.tweet_id 
    WHERE t.account_id = a.account_id
  ), 0) AS total_mentions,
  COALESCE(ma.mentioned_accounts, '[]'::json) AS mentioned_accounts,
  COALESCE(tt.most_retweeted_tweets, '[]'::json) AS most_retweeted_tweets,
  COALESCE(tt.most_favorited_tweets, '[]'::json) AS most_favorited_tweets,
  CURRENT_TIMESTAMP AS last_updated
FROM public.account a
LEFT JOIN mentioned_accounts ma ON ma.account_id = a.account_id
LEFT JOIN top_tweets tt ON tt.account_id = a.account_id;
CREATE UNIQUE INDEX idx_account_activity_summary_account_id
ON public.account_activity_summary (account_id);


--UPDATE OLD FUNCTIONS TO USE ALL_ACCOUNT

CREATE OR REPLACE VIEW public.tweets_enriched AS
SELECT 
    t.tweet_id,
    t.account_id,
    a.username,
    a.account_display_name,
    t.created_at,
    t.full_text,
    t.retweet_count,
    t.favorite_count,
    t.reply_to_tweet_id,
    t.reply_to_user_id,
    t.reply_to_username,
    -- Get quoted tweet info
    qt.quoted_tweet_id,
    c.conversation_id,
    -- Get latest avatar URL from profile
    (SELECT p.avatar_media_url
     FROM profile p 
     WHERE p.account_id = t.account_id
     ORDER BY p.archive_upload_id DESC 
     LIMIT 1) as avatar_media_url,
    t.archive_upload_id
FROM tweets t
JOIN account a ON t.account_id = a.account_id
LEFT JOIN conversations c ON t.tweet_id = c.tweet_id
LEFT JOIN quote_tweets qt ON t.tweet_id = qt.tweet_id; 



CREATE OR REPLACE VIEW public.enriched_tweets AS
SELECT 
    t.tweet_id,
    t.account_id,
    a.username,
    a.account_display_name,
    t.created_at,
    t.full_text,
    t.retweet_count,
    t.favorite_count,
    t.reply_to_tweet_id,
    t.reply_to_user_id,
    t.reply_to_username,
    qt.quoted_tweet_id,
    c.conversation_id,
    (SELECT p.avatar_media_url
     FROM profile p 
     WHERE p.account_id = t.account_id
     ORDER BY p.archive_upload_id DESC 
     LIMIT 1) as avatar_media_url,
    t.archive_upload_id
FROM tweets t
JOIN all_account a ON t.account_id = a.account_id
LEFT JOIN conversations c ON t.tweet_id = c.tweet_id
LEFT JOIN quote_tweets qt ON t.tweet_id = qt.tweet_id; 
BEGIN;
   LOCK TABLE public.tweets, 
           public.all_profile, 
           public.followers, 
           public.following, 
           public.likes, 
           public.tweet_media 
   IN ACCESS EXCLUSIVE MODE;
       -- Modify tweets table
   ALTER TABLE public.tweets DROP CONSTRAINT IF EXISTS tweets_archive_upload_id_fkey;
   ALTER TABLE public.tweets ALTER COLUMN archive_upload_id DROP NOT NULL;
   ALTER TABLE public.tweets 
   ADD CONSTRAINT tweets_archive_upload_id_fkey 
   FOREIGN KEY (archive_upload_id) 
   REFERENCES public.archive_upload (id);
   -- Modify profile table
   ALTER TABLE public.all_profile DROP CONSTRAINT IF EXISTS all_profile_archive_upload_id_fkey;
   ALTER TABLE public.all_profile ALTER COLUMN archive_upload_id DROP NOT NULL;
   ALTER TABLE public.all_profile 
   ADD CONSTRAINT all_profile_archive_upload_id_fkey 
   FOREIGN KEY (archive_upload_id) 
   REFERENCES public.archive_upload (id);
   -- Modify followers table
   ALTER TABLE public.followers DROP CONSTRAINT IF EXISTS followers_archive_upload_id_fkey;
   ALTER TABLE public.followers ALTER COLUMN archive_upload_id DROP NOT NULL;
   ALTER TABLE public.followers 
   ADD CONSTRAINT followers_archive_upload_id_fkey 
   FOREIGN KEY (archive_upload_id) 
   REFERENCES public.archive_upload (id);
   -- Modify following table
   ALTER TABLE public.following DROP CONSTRAINT IF EXISTS following_archive_upload_id_fkey;
   ALTER TABLE public.following ALTER COLUMN archive_upload_id DROP NOT NULL;
   ALTER TABLE public.following 
   ADD CONSTRAINT following_archive_upload_id_fkey 
   FOREIGN KEY (archive_upload_id) 
   REFERENCES public.archive_upload (id);
   -- Modify likes table
   ALTER TABLE public.likes DROP CONSTRAINT IF EXISTS likes_archive_upload_id_fkey;
   ALTER TABLE public.likes ALTER COLUMN archive_upload_id DROP NOT NULL;
   ALTER TABLE public.likes 
   ADD CONSTRAINT likes_archive_upload_id_fkey 
   FOREIGN KEY (archive_upload_id) 
   REFERENCES public.archive_upload (id);
   -- Modify tweet_media table
   ALTER TABLE public.tweet_media DROP CONSTRAINT IF EXISTS tweet_media_archive_upload_id_fkey;
   ALTER TABLE public.tweet_media ALTER COLUMN archive_upload_id DROP NOT NULL;
   ALTER TABLE public.tweet_media 
   ADD CONSTRAINT tweet_media_archive_upload_id_fkey 
   FOREIGN KEY (archive_upload_id) 
   REFERENCES public.archive_upload (id);
   -- add updated_at column to tables
   -- First create the trigger function if it doesn't exist
   CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
       NEW.updated_at = CURRENT_TIMESTAMP;
       RETURN NEW;
   END;
   $$ language 'plpgsql';
   -- Add updated_at column and trigger to tweets table
   ALTER TABLE public.tweets 
   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
   DROP TRIGGER IF EXISTS update_tweets_updated_at ON public.tweets;
   CREATE TRIGGER update_tweets_updated_at 
       BEFORE UPDATE ON public.tweets 
       FOR EACH ROW 
       EXECUTE FUNCTION update_updated_at_column();
   -- Add updated_at column and trigger to profile table
   ALTER TABLE public.all_profile 
   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
   DROP TRIGGER IF EXISTS update_all_profile_updated_at ON public.all_profile;
   CREATE TRIGGER update_all_profile_updated_at 
       BEFORE UPDATE ON public.all_profile 
       FOR EACH ROW 
       EXECUTE FUNCTION update_updated_at_column();
   -- Add updated_at column and trigger to account table
   ALTER TABLE public.all_account 
   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
   DROP TRIGGER IF EXISTS update_all_account_updated_at ON public.all_account;
   CREATE TRIGGER update_all_account_updated_at 
       BEFORE UPDATE ON public.all_account 
       FOR EACH ROW 
       EXECUTE FUNCTION update_updated_at_column();
   -- Add updated_at column and trigger to followers table
   ALTER TABLE public.followers 
   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
   DROP TRIGGER IF EXISTS update_followers_updated_at ON public.followers;
   CREATE TRIGGER update_followers_updated_at 
       BEFORE UPDATE ON public.followers 
       FOR EACH ROW 
       EXECUTE FUNCTION update_updated_at_column();
   -- Add updated_at column and trigger to following table
   ALTER TABLE public.following 
   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
   DROP TRIGGER IF EXISTS update_following_updated_at ON public.following;
   CREATE TRIGGER update_following_updated_at 
       BEFORE UPDATE ON public.following 
       FOR EACH ROW 
       EXECUTE FUNCTION update_updated_at_column();
   -- Add updated_at column and trigger to likes table
   ALTER TABLE public.likes 
   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
   DROP TRIGGER IF EXISTS update_likes_updated_at ON public.likes;
   CREATE TRIGGER update_likes_updated_at 
       BEFORE UPDATE ON public.likes 
       FOR EACH ROW 
       EXECUTE FUNCTION update_updated_at_column();
   -- Add updated_at column and trigger to tweet_media table
   ALTER TABLE public.tweet_media 
   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
   DROP TRIGGER IF EXISTS update_tweet_media_updated_at ON public.tweet_media;
   CREATE TRIGGER update_tweet_media_updated_at 
       BEFORE UPDATE ON public.tweet_media 
       FOR EACH ROW 
       EXECUTE FUNCTION update_updated_at_column();
   -- Add updated_at column and trigger to tweet_urls table
   ALTER TABLE public.tweet_urls 
   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
   DROP TRIGGER IF EXISTS update_tweet_urls_updated_at ON public.tweet_urls;
   CREATE TRIGGER update_tweet_urls_updated_at 
       BEFORE UPDATE ON public.tweet_urls
       FOR EACH ROW 
       EXECUTE FUNCTION update_updated_at_column();
   ALTER TABLE public.user_mentions
   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
   DROP TRIGGER IF EXISTS update_user_mentions_updated_at ON public.user_mentions;
   CREATE TRIGGER update_user_mentions_updated_at 
       BEFORE UPDATE ON public.user_mentions
       FOR EACH ROW 
       EXECUTE FUNCTION update_updated_at_column();
COMMIT;
/* CREATE SCHEMA FOR TES and necessary tables */
CREATE SCHEMA IF NOT EXISTS tes;
 -- Grant schema usage to all roles
GRANT USAGE ON SCHEMA tes TO anon, authenticated, service_role;
-- For existing tables: full access to service_role, read-only to others
GRANT ALL ON ALL TABLES IN SCHEMA tes TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA tes TO anon, authenticated;
-- For existing routines: full access to service_role only
GRANT ALL ON ALL ROUTINES IN SCHEMA tes TO service_role;
-- For existing sequences: full access to service_role only
GRANT ALL ON ALL SEQUENCES IN SCHEMA tes TO service_role;
-- For future tables: full access to service_role, read-only to others
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tes 
    GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tes 
    GRANT SELECT ON TABLES TO anon, authenticated;
-- For future routines: full access to service_role only
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tes 
    GRANT ALL ON ROUTINES TO service_role;
-- For future sequences: full access to service_role only
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tes 
    GRANT ALL ON SEQUENCES TO service_role;
 -- table to disable users from sending live data to the community archive
CREATE TABLE IF NOT EXISTS tes.blocked_scraping_users (
     account_id TEXT PRIMARY KEY ,
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
 );
CREATE TRIGGER update_tes_blocked_scraping_timestamp
     BEFORE UPDATE ON tes.blocked_scraping_users
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column();
 -- Enable RLS
ALTER TABLE tes.blocked_scraping_users ENABLE ROW LEVEL SECURITY;
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow select for all" ON tes.blocked_scraping_users;
-- Create read-only policy for authenticated and anonymous users
CREATE POLICY "Allow select for all" 
ON tes.blocked_scraping_users
FOR SELECT 
TO public
USING (true);
--create bucket
insert into storage.buckets (id, name,public) values  
('twitter_api_files', 'twitter_api_files',false);
CREATE TABLE IF NOT EXISTS public.temporary_data (
    type VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    originator_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data JSONB NOT NULL,
    user_id VARCHAR(255) NOT NULL DEFAULT 'anon',
    inserted TIMESTAMP WITH TIME ZONE,
    stored boolean DEFAULT false,
    PRIMARY KEY (type, originator_id, item_id, timestamp)
);
ALTER TABLE public.temporary_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY temporary_data_select_policy 
    ON public.temporary_data
    FOR SELECT 
    USING (true);
CREATE POLICY temporary_data_insert_policy 
    ON public.temporary_data
    FOR INSERT 
    WITH CHECK (true);
CREATE POLICY temporary_data_update_policy 
    ON public.temporary_data
    FOR UPDATE 
    WITH CHECK (false);
CREATE POLICY temporary_data_no_delete_policy 
    ON public.temporary_data
    FOR DELETE
    USING (false);
CREATE OR REPLACE FUNCTION private.tes_process_account_records()
RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN
        WITH latest_records AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'account_id')::text 
                    ORDER BY (data->>'created_at')::timestamp with time zone DESC
                ) as rn
            FROM temporary_data 
            WHERE type = 'import_account' 
            AND (data->>'account_id')::text IS NOT NULL
            AND inserted IS NULL
        ),
        insertions AS (
            INSERT INTO public.all_account
            SELECT 
                (data->>'account_id')::text,
                (data->>'created_via')::text,
                (data->>'username')::text,
                (data->>'created_at')::timestamp with time zone,
                (data->>'account_display_name')::text,
                NULLIF((data->>'num_tweets')::text, '')::integer,
                NULLIF((data->>'num_following')::text, '')::integer,
                NULLIF((data->>'num_followers')::text, '')::integer,
                NULLIF((data->>'num_likes')::text, '')::integer
            FROM latest_records
            WHERE rn = 1
            ON CONFLICT (account_id) 
            DO UPDATE SET
                --created_via = EXCLUDED.created_via,
                username = EXCLUDED.username,
                created_at = EXCLUDED.created_at,
                account_display_name = EXCLUDED.account_display_name,
                num_tweets = EXCLUDED.num_tweets,
                num_following = EXCLUDED.num_following,
                num_followers = EXCLUDED.num_followers,
                num_likes = EXCLUDED.num_likes
            RETURNING account_id
        )
        SELECT array_agg(account_id) INTO processed_ids FROM insertions;
        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);
        -- Update inserted timestamp
        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as account_id
        )
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        FROM processed_ids_table pit
        WHERE td.type = 'import_account' 
        AND (td.data->>'account_id')::text = pit.account_id;
        -- Get error records
        SELECT array_agg((data->>'account_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_account'
        AND (data->>'account_id')::text IS NOT NULL
        AND inserted IS NULL;
        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION private.tes_process_profile_records()
RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN
        WITH latest_records AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'account_id')::text 
                    ORDER BY (data->>'created_at')::timestamp with time zone DESC
                ) as rn
            FROM temporary_data 
            WHERE type = 'import_profile' 
            AND (data->>'account_id')::text IS NOT NULL
            AND inserted IS NULL
        ),
        insertions AS (
            INSERT INTO public.all_profile (
                account_id,
                bio,
                website,
                location,
                avatar_media_url,
                header_media_url
            )
            SELECT 
                (data->>'account_id')::text,
                (data->>'bio')::text,
                (data->>'website')::text,
                (data->>'location')::text,
                (data->>'avatar_media_url')::text,
                (data->>'header_media_url')::text
            FROM latest_records
            WHERE rn = 1
            ON CONFLICT (account_id) 
            DO UPDATE SET
                bio = EXCLUDED.bio,
                website = EXCLUDED.website,
                location = EXCLUDED.location,
                avatar_media_url = EXCLUDED.avatar_media_url,
                header_media_url = EXCLUDED.header_media_url
            RETURNING account_id
        )
        SELECT array_agg(account_id) INTO processed_ids FROM insertions;
        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);
        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as account_id
        )
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        FROM processed_ids_table pit
        WHERE td.type = 'import_profile' 
        AND (td.data->>'account_id')::text = pit.account_id;
        SELECT array_agg((data->>'account_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_profile'
        AND (data->>'account_id')::text IS NOT NULL
        AND inserted IS NULL;
        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION private.tes_process_tweet_records()
RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN
        WITH latest_records AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'tweet_id')::text 
                    ORDER BY (data->>'created_at')::timestamp with time zone DESC
                ) as rn
            FROM temporary_data 
            WHERE type = 'import_tweet' 
            AND (data->>'tweet_id')::text IS NOT NULL
            AND inserted IS NULL
        ),
        insertions AS (
            INSERT INTO public.tweets (
                tweet_id,
                account_id,
                created_at,
                full_text,
                retweet_count,
                favorite_count,
                reply_to_tweet_id,
                reply_to_user_id,
                reply_to_username
            )
            SELECT 
                (data->>'tweet_id')::text,
                (data->>'account_id')::text,
                (data->>'created_at')::timestamp with time zone,
                (data->>'full_text')::text,
                COALESCE((data->>'retweet_count')::integer, 0),
                COALESCE((data->>'favorite_count')::integer, 0),
                NULLIF((data->>'reply_to_tweet_id')::text, ''),
                NULLIF((data->>'reply_to_user_id')::text, ''),
                NULLIF((data->>'reply_to_username')::text, '')
            FROM latest_records
            WHERE rn = 1
            ON CONFLICT (tweet_id) 
            DO UPDATE SET
                account_id = EXCLUDED.account_id,
                created_at = EXCLUDED.created_at,
                full_text = EXCLUDED.full_text,
                retweet_count = EXCLUDED.retweet_count,
                favorite_count = EXCLUDED.favorite_count,
                reply_to_tweet_id = EXCLUDED.reply_to_tweet_id,
                reply_to_user_id = EXCLUDED.reply_to_user_id,
                reply_to_username = EXCLUDED.reply_to_username
            RETURNING tweet_id
        )
        SELECT array_agg(tweet_id) INTO processed_ids FROM insertions;
        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);
        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as tweet_id
        )
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        FROM processed_ids_table pit
        WHERE td.type = 'import_tweet' 
        AND (td.data->>'tweet_id')::text = pit.tweet_id;
        SELECT array_agg((data->>'tweet_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_tweet'
        AND (data->>'tweet_id')::text IS NOT NULL
        AND inserted IS NULL;
        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION private.tes_process_media_records()
RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN
        WITH latest_records AS (
            SELECT DISTINCT ON ((data->>'media_id')::text)
                (data->>'media_id')::bigint as media_id,
                (data->>'tweet_id')::text as tweet_id,
                (data->>'media_url')::text as media_url,
                (data->>'media_type')::text as media_type,
                (data->>'width')::integer as width,
                (data->>'height')::integer as height
            FROM temporary_data 
            WHERE type = 'import_media'
            AND (data->>'media_id')::text IS NOT NULL
            AND inserted IS NULL
            ORDER BY (data->>'media_id')::text, timestamp DESC
        ),
        insertions AS (
            INSERT INTO public.tweet_media (
                media_id,
                tweet_id,
                media_url,
                media_type,
                width,
                height
            )
            SELECT 
                media_id,
                tweet_id,
                media_url,
                media_type,
                width,
                height
            FROM latest_records
            ON CONFLICT (media_id) 
            DO UPDATE SET
                tweet_id = EXCLUDED.tweet_id,
                media_url = EXCLUDED.media_url,
                media_type = EXCLUDED.media_type,
                width = EXCLUDED.width,
                height = EXCLUDED.height
            RETURNING media_id::text
        )
        SELECT array_agg(media_id) INTO processed_ids FROM insertions;
        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);
        -- Update inserted timestamp for ALL related records
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        WHERE td.type = 'import_media'
        AND (td.data->>'media_id')::text = ANY(processed_ids);
        -- Get error records
        SELECT array_agg((data->>'media_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_media'
        AND (data->>'media_id')::text IS NOT NULL
        AND inserted IS NULL;
        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION private.tes_process_url_records()
RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN
        WITH latest_records AS (
            SELECT DISTINCT ON ((data->>'tweet_id')::text, (data->>'url')::text)
                data->>'url' as url,
                data->>'expanded_url' as expanded_url,
                data->>'display_url' as display_url,
                data->>'tweet_id' as tweet_id
            FROM temporary_data 
            WHERE type = 'import_url'
            AND (data->>'tweet_id')::text IS NOT NULL
            AND inserted IS NULL
            ORDER BY (data->>'tweet_id')::text, (data->>'url')::text, timestamp DESC
        ),
        insertions AS (
            INSERT INTO public.tweet_urls (
                url,
                expanded_url,
                display_url,
                tweet_id
            )
            SELECT 
                url,
                expanded_url,
                display_url,
                tweet_id
            FROM latest_records
            ON CONFLICT (tweet_id, url) 
            DO UPDATE SET
                expanded_url = EXCLUDED.expanded_url,
                display_url = EXCLUDED.display_url
            RETURNING tweet_id, url
        )
        SELECT array_agg(DISTINCT tweet_id) INTO processed_ids FROM insertions;
        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);
        -- Update inserted timestamp for ALL related records
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        WHERE td.type = 'import_url'
        AND (td.data->>'tweet_id')::text || ':' || (td.data->>'url')::text IN (
            SELECT (data->>'tweet_id')::text || ':' || (data->>'url')::text
            FROM temporary_data
            WHERE type = 'import_url'
            AND (data->>'tweet_id')::text = ANY(processed_ids)
        );
        -- Get error records
        SELECT array_agg((data->>'tweet_id')::text || ':' || (data->>'url')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_url'
        AND (data->>'tweet_id')::text IS NOT NULL
        AND inserted IS NULL;
        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION private.tes_process_mention_records()
RETURNS TABLE (
    processed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    processed_count INTEGER := 0;
    error_records TEXT[];
    processed_ids TEXT[];
BEGIN
    BEGIN
        -- First, insert or update the mentioned users
        WITH latest_records AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY (data->>'mentioned_user_id')::text 
                    ORDER BY timestamp DESC
                ) as rn
            FROM temporary_data 
            WHERE type = 'import_mention'
            AND (data->>'mentioned_user_id')::text IS NOT NULL
            AND inserted IS NULL
        ),
        user_insertions AS (
            INSERT INTO public.mentioned_users (
                user_id,
                name,
                screen_name,
                updated_at
            )
            SELECT 
                (data->>'mentioned_user_id')::text,
                (data->>'display_name')::text,
                (data->>'username')::text,
                CURRENT_TIMESTAMP
            FROM latest_records
            WHERE rn = 1
            ON CONFLICT (user_id) 
            DO UPDATE SET
                name = EXCLUDED.name,
                screen_name = EXCLUDED.screen_name,
                updated_at = CURRENT_TIMESTAMP
        ),
        mention_insertions AS (
            INSERT INTO public.user_mentions (
                mentioned_user_id,
                tweet_id
            )
            SELECT DISTINCT
                (data->>'mentioned_user_id')::text,
                (data->>'tweet_id')::text
            FROM latest_records
            WHERE rn = 1
            ON CONFLICT (mentioned_user_id, tweet_id) 
            DO UPDATE SET
                mentioned_user_id = EXCLUDED.mentioned_user_id
            RETURNING tweet_id
        )
        SELECT array_agg(tweet_id) INTO processed_ids FROM mention_insertions;
        SELECT COUNT(*) INTO processed_count
        FROM unnest(processed_ids);
        -- Update inserted timestamp
        WITH processed_ids_table AS (
            SELECT unnest(processed_ids) as tweet_id
        )
        UPDATE temporary_data td
        SET inserted = CURRENT_TIMESTAMP
        FROM processed_ids_table pit
        WHERE td.type = 'import_mention' 
        AND (td.data->>'tweet_id')::text = pit.tweet_id;
        -- Get error records
        SELECT array_agg((data->>'mentioned_user_id')::text || ':' || (data->>'tweet_id')::text)
        INTO error_records
        FROM temporary_data
        WHERE type = 'import_mention'
        AND (data->>'mentioned_user_id')::text IS NOT NULL
        AND inserted IS NULL;
        RETURN QUERY SELECT processed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION private.tes_complete_group_insertions()
RETURNS TABLE (
    completed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    completed_count INTEGER := 0;
    error_records TEXT[];
BEGIN
    BEGIN
        WITH api_groups AS (
            SELECT DISTINCT originator_id
            FROM temporary_data td1
            WHERE 
                -- Find groups where all records are API-type
                type LIKE 'api%'
                AND NOT EXISTS (
                    SELECT 1 
                    FROM temporary_data td2 
                    WHERE td2.originator_id = td1.originator_id 
                    AND td2.type NOT LIKE 'api%'
                    AND td2.inserted IS NULL
                )
        ),
        updates AS (
            UPDATE temporary_data td
            SET inserted = CURRENT_TIMESTAMP
            FROM api_groups ag
            WHERE td.originator_id = ag.originator_id
            AND td.type LIKE 'api%'
            AND td.inserted IS NULL
            RETURNING td.originator_id
        )
        SELECT COUNT(DISTINCT originator_id), array_agg(DISTINCT originator_id)
        INTO completed_count, error_records
        FROM updates;
        RETURN QUERY SELECT completed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION private.tes_import_temporary_data_into_tables()
RETURNS void AS $$
DECLARE
    account_result RECORD;
    profile_result RECORD;
    tweet_result RECORD;
    media_result RECORD;
    url_result RECORD;
    mention_result RECORD;
BEGIN
    RAISE NOTICE 'Starting tes_import_temporary_data_into_tables';
    -- Process accounts and capture results
    SELECT * INTO account_result FROM private.tes_process_account_records();
    RAISE NOTICE 'Processed % accounts with % errors', account_result.processed, array_length(account_result.errors, 1);
    -- Process profiles and capture results  
    SELECT * INTO profile_result FROM private.tes_process_profile_records();
    RAISE NOTICE 'Processed % profiles with % errors', profile_result.processed, array_length(profile_result.errors, 1);
    -- Process tweets and capture results
    SELECT * INTO tweet_result FROM private.tes_process_tweet_records();
    RAISE NOTICE 'Processed % tweets with % errors', tweet_result.processed, array_length(tweet_result.errors, 1);
    -- Process media and capture results
    SELECT * INTO media_result FROM private.tes_process_media_records();
    RAISE NOTICE 'Processed % media with % errors', media_result.processed, array_length(media_result.errors, 1);
    -- Process urls and capture results
    SELECT * INTO url_result FROM private.tes_process_url_records();
    RAISE NOTICE 'Processed % urls with % errors', url_result.processed, array_length(url_result.errors, 1);
    -- Process mentions and capture results
    SELECT * INTO mention_result FROM private.tes_process_mention_records();
    RAISE NOTICE 'Processed % mentions with % errors', mention_result.processed, array_length(mention_result.errors, 1);
    PERFORM private.tes_complete_group_insertions();
    RAISE NOTICE 'Job completed';
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in tes_import_temporary_data_into_tables: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION private.tes_invoke_edge_function_move_data_to_storage()
RETURNS void AS $$
DECLARE
    request_id TEXT;
    response_status INTEGER;
    start_time TIMESTAMP;
    elapsed_seconds NUMERIC;
BEGIN
    PERFORM net.http_post(
        url:='https://fabxmporizzqflnftavs.supabase.co/functions/v1/schedule_data_moving'
    );
END;
$$ LANGUAGE plpgsql;
-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;
select
  cron.schedule(
    'tes-invoke-edge-function-scheduler',
    '* * * * *', 
    $$
    select private.tes_invoke_edge_function_move_data_to_storage()
    $$
  );
-- Schedule job to run every 5 minutes
SELECT cron.schedule('tes-insert-temporary-data-into-tables', 
    '* * * * *', $$SELECT private.tes_import_temporary_data_into_tables();$$);
