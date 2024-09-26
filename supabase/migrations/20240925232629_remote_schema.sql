set check_function_bodies = off;

CREATE OR REPLACE FUNCTION dev.commit_temp_data(p_suffix text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '10min'
AS $function$
  DECLARE
      v_archive_upload_id BIGINT;
      v_account_id TEXT;
      v_archive_at TIMESTAMP WITH TIME ZONE;
  BEGIN
      IF auth.uid() IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

      -- 1. Insert account data first
      EXECUTE format('
          INSERT INTO dev.account (created_via, username, account_id, created_at, account_display_name)
          SELECT created_via, username, account_id, created_at, account_display_name 
          FROM temp.account_%s
          ON CONFLICT (account_id) DO UPDATE SET 
              username = EXCLUDED.username, 
              account_display_name = EXCLUDED.account_display_name, 
              created_via = EXCLUDED.created_via, 
              created_at = EXCLUDED.created_at
          RETURNING account_id
      ', p_suffix) INTO v_account_id;

      -- 2. Get the latest archive_at from temp.archive_upload
      EXECUTE format('
          SELECT archive_at 
          FROM temp.archive_upload_%s 
          ORDER BY archive_at DESC 
          LIMIT 1
      ', p_suffix) INTO v_archive_at;

      -- 3. Insert or update archive_upload and get the ID
      INSERT INTO dev.archive_upload (account_id, archive_at, created_at)
      VALUES (v_account_id, v_archive_at, CURRENT_TIMESTAMP)
      ON CONFLICT (account_id, archive_at) 
      DO UPDATE SET 
          account_id = EXCLUDED.account_id, -- This effectively does nothing, but allows us to use RETURNING
          created_at = CURRENT_TIMESTAMP
      RETURNING id INTO v_archive_upload_id;

      -- Insert profile data
      EXECUTE format('
          INSERT INTO dev.profile (bio, website, location, avatar_media_url, header_media_url, account_id, archive_upload_id)
          SELECT p.bio, p.website, p.location, p.avatar_media_url, p.header_media_url, p.account_id, $1
          FROM temp.profile_%s p
          ON CONFLICT (account_id, archive_upload_id) DO UPDATE SET
              bio = EXCLUDED.bio,
              website = EXCLUDED.website,
              location = EXCLUDED.location,
              avatar_media_url = EXCLUDED.avatar_media_url,
              header_media_url = EXCLUDED.header_media_url,
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;

      -- Insert tweets data
      EXECUTE format('
          INSERT INTO dev.tweets (tweet_id, account_id, created_at, full_text, retweet_count, favorite_count, reply_to_tweet_id, reply_to_user_id, reply_to_username, archive_upload_id)
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

      -- raise exception 'check tweets and media suffix: % tweets:  % media: %', p_suffix, (select tweet_id from dev.tweets where archive_upload_id = v_archive_upload_id), (select tweet_id from temp.tweet_media_322603863);


      -- Insert tweet_media data
      EXECUTE format('
          INSERT INTO dev.tweet_media (media_id, tweet_id, media_url, media_type, width, height, archive_upload_id)
          SELECT tm.media_id, tm.tweet_id, tm.media_url, tm.media_type, tm.width, tm.height, $1
          FROM temp.tweet_media_%s tm
          ON CONFLICT (media_id) DO UPDATE SET
              media_url = EXCLUDED.media_url,
              media_type = EXCLUDED.media_type,
              width = EXCLUDED.width,
              height = EXCLUDED.height,
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;


      -- Insert mentioned_users data (no archive_upload_id needed)
      EXECUTE format('
          INSERT INTO dev.mentioned_users (user_id, name, screen_name, updated_at)
          SELECT user_id, name, screen_name, updated_at
          FROM temp.mentioned_users_%s
          ON CONFLICT (user_id) DO UPDATE SET 
              name = EXCLUDED.name, 
              screen_name = EXCLUDED.screen_name, 
              updated_at = EXCLUDED.updated_at
      ', p_suffix);

      -- Insert user_mentions data (no archive_upload_id needed)
      EXECUTE format('
          INSERT INTO dev.user_mentions (mentioned_user_id, tweet_id)
          SELECT um.mentioned_user_id, um.tweet_id
          FROM temp.user_mentions_%s um
          JOIN dev.mentioned_users mu ON um.mentioned_user_id = mu.user_id
          JOIN dev.tweets t ON um.tweet_id = t.tweet_id
          ON CONFLICT (mentioned_user_id, tweet_id) DO NOTHING
      ', p_suffix);

      -- Insert tweet_urls data (no archive_upload_id needed)
      EXECUTE format('
          INSERT INTO dev.tweet_urls (url, expanded_url, display_url, tweet_id)
          SELECT tu.url, tu.expanded_url, tu.display_url, tu.tweet_id
          FROM temp.tweet_urls_%s tu
          JOIN dev.tweets t ON tu.tweet_id = t.tweet_id
          ON CONFLICT (tweet_id, url) DO NOTHING
      ', p_suffix);

      -- Insert followers data
      EXECUTE format('
          INSERT INTO dev.followers (account_id, follower_account_id, archive_upload_id)
          SELECT f.account_id, f.follower_account_id, $1
          FROM temp.followers_%s f
          ON CONFLICT (account_id, follower_account_id) DO UPDATE SET
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;

      -- Insert following data
      EXECUTE format('
          INSERT INTO dev.following (account_id, following_account_id, archive_upload_id)
          SELECT f.account_id, f.following_account_id, $1
          FROM temp.following_%s f
          ON CONFLICT (account_id, following_account_id) DO UPDATE SET
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;

      -- Insert liked_tweets data (no archive_upload_id needed)
      EXECUTE format('
          INSERT INTO dev.liked_tweets (tweet_id, full_text)
          SELECT lt.tweet_id, lt.full_text
          FROM temp.liked_tweets_%s lt
          ON CONFLICT (tweet_id) DO NOTHING
      ', p_suffix);

      -- Insert likes data
      EXECUTE format('
          INSERT INTO dev.likes (account_id, liked_tweet_id, archive_upload_id)
          SELECT l.account_id, l.liked_tweet_id, $1
          FROM temp.likes_%s l
          ON CONFLICT (account_id, liked_tweet_id) DO UPDATE SET
              archive_upload_id = EXCLUDED.archive_upload_id
      ', p_suffix) USING v_archive_upload_id;

      -- Call the function to drop temporary tables
      PERFORM dev.drop_temp_tables(p_suffix);
  END;
  $function$
;


set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.insert_temp_account(p_account jsonb, p_suffix text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  BEGIN
      IF auth.uid() IS NULL AND current_user != 'postgres' THEN
          RAISE EXCEPTION 'Not authenticated';
      END IF;

      EXECUTE format('
          INSERT INTO temp.account_%s (account_id, created_via, username, created_at, account_display_name)
          SELECT
              $1->>''accountId'',
              $1->>''createdVia'',
              $1->>''username'',
              ($1->>''createdAt'')::TIMESTAMP WITH TIME ZONE,
              $1->>''accountDisplayName''
      ', p_suffix)
      USING p_account;
  END;
  $function$
;


