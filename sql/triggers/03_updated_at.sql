   CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
       NEW.updated_at = CURRENT_TIMESTAMP;
       RETURN NEW;
   END;
   $$ language 'plpgsql';


DROP TRIGGER IF EXISTS update_all_account_updated_at ON public.all_account;
DROP TRIGGER IF EXISTS update_all_profile_updated_at ON public.all_profile;
DROP TRIGGER IF EXISTS update_tweets_updated_at ON public.tweets;
DROP TRIGGER IF EXISTS update_user_mentions_updated_at ON public.user_mentions;
DROP TRIGGER IF EXISTS update_tweet_urls_updated_at ON public.tweet_urls;
DROP TRIGGER IF EXISTS update_tweet_media_updated_at ON public.tweet_media;
DROP TRIGGER IF EXISTS update_followers_updated_at ON public.followers;
DROP TRIGGER IF EXISTS update_following_updated_at ON public.following;
DROP TRIGGER IF EXISTS update_likes_updated_at ON public.likes;
DROP TRIGGER IF EXISTS update_tes_blocked_scraping_timestamp ON tes.blocked_scraping_users;

CREATE TRIGGER update_all_account_updated_at 
    BEFORE UPDATE ON public.all_account 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_all_profile_updated_at 
    BEFORE UPDATE ON public.all_profile 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tweets_updated_at 
    BEFORE UPDATE ON public.tweets 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_mentions_updated_at 
    BEFORE UPDATE ON public.user_mentions
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tweet_urls_updated_at 
    BEFORE UPDATE ON public.tweet_urls
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tweet_media_updated_at 
    BEFORE UPDATE ON public.tweet_media 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_followers_updated_at 
    BEFORE UPDATE ON public.followers 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_following_updated_at 
    BEFORE UPDATE ON public.following 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_likes_updated_at 
    BEFORE UPDATE ON public.likes 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER update_tes_blocked_scraping_timestamp
    BEFORE UPDATE ON tes.blocked_scraping_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();