-- Let an authenticated member remove only the associations between their X
-- account and liked tweets. The shared liked_tweets content table is
-- intentionally left untouched.

CREATE OR REPLACE FUNCTION public.delete_own_likes()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
SET search_path = ''
AS $$
DECLARE
  v_provider_id text;
  v_deleted_likes bigint;
BEGIN
  v_provider_id := nullif(auth.jwt()->'app_metadata'->>'provider_id', '');

  IF auth.uid() IS NULL OR v_provider_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'A linked Twitter account is required';
  END IF;

  WITH deleted AS (
    DELETE FROM public.likes
    WHERE account_id = v_provider_id
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted_likes FROM deleted;

  RETURN v_deleted_likes;
END;
$$;

ALTER FUNCTION public.delete_own_likes() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_own_likes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_likes() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_own_likes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_likes() TO service_role;

COMMENT ON FUNCTION public.delete_own_likes() IS
  'Deletes likes owned by the authenticated Twitter account without deleting shared liked_tweets content.';
