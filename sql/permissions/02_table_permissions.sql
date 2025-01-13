-- Enable RLS on all tables
ALTER TABLE public.account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.all_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tweets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentioned_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tweet_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tweet_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.following ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liked_tweets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.all_account ENABLE ROW LEVEL SECURITY;