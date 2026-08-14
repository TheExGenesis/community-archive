CREATE TABLE public.profile_settings (
  account_id TEXT PRIMARY KEY CHECK (account_id ~ '^[0-9]{1,20}$'),
  download_archive_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.profile_curation (
  account_id TEXT NOT NULL CHECK (account_id ~ '^[0-9]{1,20}$'),
  section TEXT NOT NULL CHECK (section IN ('bangers', 'people')),
  item_id TEXT NOT NULL CHECK (item_id ~ '^[0-9]{1,20}$'),
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER CHECK (position IS NULL OR position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, section, item_id)
);

CREATE INDEX profile_curation_scope_idx
  ON public.profile_curation (account_id, section, position);

CREATE TABLE public.tweet_link_previews (
  url_hash TEXT PRIMARY KEY CHECK (url_hash ~ '^[0-9a-f]{64}$'),
  normalized_url TEXT NOT NULL UNIQUE,
  canonical_url TEXT,
  title TEXT,
  description TEXT,
  image_url TEXT,
  site_name TEXT,
  content_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'ready', 'unsafe', 'failed')
  ),
  fetched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tweet_link_previews_expires_at_idx
  ON public.tweet_link_previews (expires_at);

CREATE TRIGGER update_profile_settings_updated_at
  BEFORE UPDATE ON public.profile_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profile_curation_updated_at
  BEFORE UPDATE ON public.profile_curation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tweet_link_previews_updated_at
  BEFORE UPDATE ON public.tweet_link_previews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profile_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_curation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tweet_link_previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profile settings are publicly visible"
  ON public.profile_settings FOR SELECT
  TO anon, authenticated USING (TRUE);
CREATE POLICY "Owners can insert profile settings"
  ON public.profile_settings FOR INSERT
  TO authenticated WITH CHECK (
    account_id = (SELECT auth.jwt()->'app_metadata'->>'provider_id')
  );
CREATE POLICY "Owners can update profile settings"
  ON public.profile_settings FOR UPDATE
  TO authenticated USING (
    account_id = (SELECT auth.jwt()->'app_metadata'->>'provider_id')
  ) WITH CHECK (
    account_id = (SELECT auth.jwt()->'app_metadata'->>'provider_id')
  );

CREATE POLICY "Profile curation is publicly visible"
  ON public.profile_curation FOR SELECT
  TO anon, authenticated USING (TRUE);
CREATE POLICY "Owners can insert profile curation"
  ON public.profile_curation FOR INSERT
  TO authenticated WITH CHECK (
    account_id = (SELECT auth.jwt()->'app_metadata'->>'provider_id')
  );
CREATE POLICY "Owners can update profile curation"
  ON public.profile_curation FOR UPDATE
  TO authenticated USING (
    account_id = (SELECT auth.jwt()->'app_metadata'->>'provider_id')
  ) WITH CHECK (
    account_id = (SELECT auth.jwt()->'app_metadata'->>'provider_id')
  );
CREATE POLICY "Owners can delete profile curation"
  ON public.profile_curation FOR DELETE
  TO authenticated USING (
    account_id = (SELECT auth.jwt()->'app_metadata'->>'provider_id')
  );

CREATE POLICY "Tweet link previews are publicly visible"
  ON public.tweet_link_previews FOR SELECT
  TO anon, authenticated USING (TRUE);

REVOKE ALL ON public.profile_settings FROM anon, authenticated;
REVOKE ALL ON public.profile_curation FROM anon, authenticated;
REVOKE ALL ON public.tweet_link_previews FROM anon, authenticated;
GRANT SELECT ON public.profile_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profile_settings TO authenticated;
GRANT SELECT ON public.profile_curation TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profile_curation TO authenticated;
GRANT SELECT ON public.tweet_link_previews TO anon, authenticated;
GRANT SELECT ON public.profile_settings TO readclient;
GRANT SELECT ON public.profile_curation TO readclient;
GRANT SELECT ON public.tweet_link_previews TO readclient;
GRANT ALL ON public.profile_settings TO service_role;
GRANT ALL ON public.profile_curation TO service_role;
GRANT ALL ON public.tweet_link_previews TO service_role;
