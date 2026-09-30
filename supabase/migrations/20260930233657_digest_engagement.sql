-- A page view is one client-rendered visit to a published digest.
ALTER TABLE public.digest_editions
  ADD COLUMN view_count bigint NOT NULL DEFAULT 0
  CONSTRAINT digest_editions_view_count_nonnegative CHECK (view_count >= 0);

-- Only the server's service-role client can increment the counter.
CREATE FUNCTION public.record_digest_view(p_edition_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.digest_editions
  SET view_count = view_count + 1
  WHERE id = p_edition_id AND status = 'published'
  RETURNING view_count;
$$;
REVOKE ALL ON FUNCTION public.record_digest_view(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_digest_view(uuid) TO service_role;

-- The opaque token belongs to one delivery. An open is recorded once.
ALTER TABLE public.digest_email_sends
  ADD COLUMN open_token uuid UNIQUE,
  ADD COLUMN opened_at timestamptz;
