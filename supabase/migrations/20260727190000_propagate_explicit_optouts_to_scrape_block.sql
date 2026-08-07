-- Treat every uploaded archive as public and make explicit opt-outs a hard,
-- persistent scrape deny. Blocks are never removed automatically because
-- tes.blocked_scraping_users also contains administrator-managed entries.

UPDATE public.archive_upload
SET keep_private = false
WHERE keep_private IS TRUE;

ALTER TABLE public.archive_upload
  DROP CONSTRAINT IF EXISTS archive_upload_public_only;

ALTER TABLE public.archive_upload
  ADD CONSTRAINT archive_upload_public_only
  CHECK (keep_private IS NOT TRUE);

CREATE OR REPLACE FUNCTION public.propagate_explicit_optout_scrape_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_account_id text;
BEGIN
    IF NEW.explicit_optout IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    v_account_id := NULLIF(BTRIM(NEW.twitter_user_id), '');

    IF v_account_id IS NULL AND NULLIF(BTRIM(NEW.username), '') IS NOT NULL THEN
        SELECT a.account_id
        INTO v_account_id
        FROM public.all_account AS a
        WHERE LOWER(a.username) = LOWER(BTRIM(NEW.username))
        ORDER BY a.updated_at DESC NULLS LAST
        LIMIT 1;
    END IF;

    IF v_account_id IS NOT NULL THEN
        INSERT INTO tes.blocked_scraping_users (account_id)
        VALUES (v_account_id)
        ON CONFLICT (account_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.propagate_explicit_optout_scrape_block() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.propagate_explicit_optout_scrape_block()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS propagate_explicit_optout_scrape_block ON public.optin;
CREATE TRIGGER propagate_explicit_optout_scrape_block
AFTER INSERT OR UPDATE OF explicit_optout, twitter_user_id, username
ON public.optin
FOR EACH ROW
EXECUTE FUNCTION public.propagate_explicit_optout_scrape_block();

INSERT INTO tes.blocked_scraping_users (account_id)
SELECT DISTINCT COALESCE(NULLIF(BTRIM(o.twitter_user_id), ''), a.account_id)
FROM public.optin AS o
LEFT JOIN public.all_account AS a
  ON LOWER(a.username) = LOWER(BTRIM(o.username))
WHERE o.explicit_optout IS TRUE
  AND COALESCE(NULLIF(BTRIM(o.twitter_user_id), ''), a.account_id) IS NOT NULL
ON CONFLICT (account_id) DO NOTHING;
