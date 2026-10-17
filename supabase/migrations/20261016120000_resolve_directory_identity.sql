-- Resolve one profile identifier against public.user_directory without paying
-- for a full evaluation of the view's opted_in_members branch on a miss.
--
-- Every user_directory row is built from all_account (via account) or from an
-- opted-in optin row, so if neither base table has a candidate matching the
-- identifier, the view cannot return one either. Only when a candidate exists
-- is the view queried, and the view stays the sole authority on membership and
-- consent: this function never re-implements its predicates.
--
-- SECURITY INVOKER keeps the caller's RLS on both the prefilter and the view.

-- Index probes for the prefilter. all_account already has its primary key and
-- idx_all_account_lower_username.
CREATE INDEX IF NOT EXISTS optin_opted_in_twitter_user_id_idx
  ON public.optin USING btree (twitter_user_id)
  WHERE opted_in = true;

CREATE INDEX IF NOT EXISTS optin_opted_in_username_lower_idx
  ON public.optin USING btree (lower(username))
  WHERE opted_in = true;

CREATE OR REPLACE FUNCTION public.resolve_directory_identity(identifier text)
RETURNS TABLE (account_id text, username text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- All-digit identifiers are account IDs; anything else is a handle. A
  -- numeric handle never matches a username, mirroring the application.
  IF identifier ~ '^[0-9]+$' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.all_account a WHERE a.account_id = identifier
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.optin o
      WHERE o.opted_in = true
        AND o.twitter_user_id = identifier
    ) THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT d.account_id, d.username
    FROM public.user_directory d
    WHERE d.account_id = identifier
    LIMIT 1;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.all_account a
      WHERE lower(a.username) = lower(identifier)
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.optin o
      WHERE o.opted_in = true
        AND lower(o.username) = lower(identifier)
    ) THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT d.account_id, d.username
    FROM public.user_directory d
    WHERE lower(d.username) = lower(identifier)
    LIMIT 1;
  END IF;
END;
$$;

ALTER FUNCTION public.resolve_directory_identity(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.resolve_directory_identity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_directory_identity(text)
  TO anon, authenticated, service_role;
