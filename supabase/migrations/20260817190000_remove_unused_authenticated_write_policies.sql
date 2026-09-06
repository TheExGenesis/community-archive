-- Direct client writes to these tables have been retired. Archive ingestion and
-- profile customization now reach them only through trusted service-role code.

DROP POLICY IF EXISTS "Data is modifiable by their users" ON public.all_profile;
DROP POLICY IF EXISTS "Data is modifiable by their users" ON public.followers;
DROP POLICY IF EXISTS "Data is modifiable by their users" ON public.following;
DROP POLICY IF EXISTS "Data is modifiable by their users" ON public.likes;
DROP POLICY IF EXISTS "Data is modifiable by their users" ON public.tweets;

DROP POLICY IF EXISTS "Entities are modifiable by their users" ON public.tweet_media;
DROP POLICY IF EXISTS "Entities are modifiable by their users" ON public.tweet_urls;
DROP POLICY IF EXISTS "Entities are modifiable by their users" ON public.user_mentions;

DROP POLICY IF EXISTS "Users can create own opt-in record" ON public.optin;
DROP POLICY IF EXISTS "Users can update own opt-in status" ON public.optin;

DROP POLICY IF EXISTS "Owners can insert profile settings" ON public.profile_settings;
DROP POLICY IF EXISTS "Owners can update profile settings" ON public.profile_settings;
DROP POLICY IF EXISTS "Owners can insert profile curation" ON public.profile_curation;
DROP POLICY IF EXISTS "Owners can update profile curation" ON public.profile_curation;
DROP POLICY IF EXISTS "Owners can delete profile curation" ON public.profile_curation;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.all_profile,
  public.followers,
  public.following,
  public.likes,
  public.tweets,
  public.tweet_media,
  public.tweet_urls,
  public.user_mentions,
  public.optin,
  public.profile_settings,
  public.profile_curation
FROM anon, authenticated;
