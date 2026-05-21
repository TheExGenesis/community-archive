-- Wrap tes.blocked_scraping_users behind public-schema RPCs so the admin
-- dashboard can read and toggle the scrape blocklist without depending on the
-- `tes` schema being exposed by PostgREST.

CREATE OR REPLACE FUNCTION "public"."admin_list_blocked_scraping_users"(
  "p_account_ids" text[]
) RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    array_agg(b.account_id),
    ARRAY[]::text[]
  )
  FROM tes.blocked_scraping_users b
  WHERE p_account_ids IS NULL
     OR b.account_id = ANY(p_account_ids);
$$;

ALTER FUNCTION "public"."admin_list_blocked_scraping_users"(text[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION "public"."admin_list_blocked_scraping_users"(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."admin_list_blocked_scraping_users"(text[]) TO service_role;

CREATE OR REPLACE FUNCTION "public"."admin_set_scrape_block"(
  "p_account_id" text,
  "p_blocked" boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_account_id IS NULL OR p_account_id = '' THEN
    RAISE EXCEPTION 'p_account_id is required';
  END IF;

  IF p_blocked THEN
    INSERT INTO tes.blocked_scraping_users (account_id)
    VALUES (p_account_id)
    ON CONFLICT (account_id) DO NOTHING;
  ELSE
    DELETE FROM tes.blocked_scraping_users WHERE account_id = p_account_id;
  END IF;
END;
$$;

ALTER FUNCTION "public"."admin_set_scrape_block"(text, boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION "public"."admin_set_scrape_block"(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."admin_set_scrape_block"(text, boolean) TO service_role;
