-- Notices a reader hid as not relevant. Private per-reader feedback, kept so
-- recommendations can later learn from it. Undo deletes the row.
CREATE TABLE bulletin.dismissals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tweet_id text NOT NULL CHECK (tweet_id ~ '^[0-9]{1,20}$'),
  account_id text CHECK (account_id ~ '^[0-9]{1,20}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tweet_id)
);

CREATE FUNCTION public.get_bulletin_dismissals(viewer_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(array_agg(d.tweet_id),'{}'::text[]) FROM (
    SELECT tweet_id FROM bulletin.dismissals
    WHERE user_id=viewer_id ORDER BY created_at DESC LIMIT 5000
  ) d
$$;

-- A NULL notice with dismissed=false restores everything the reader hid.
CREATE FUNCTION public.set_bulletin_dismissal(viewer_id uuid, viewer_account_id text, notice_tweet_id text, dismissed boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF viewer_id IS NULL OR dismissed IS NULL OR (dismissed AND notice_tweet_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid dismissal' USING ERRCODE='22023';
  END IF;
  IF dismissed THEN
    INSERT INTO bulletin.dismissals(user_id,tweet_id,account_id)
      VALUES(viewer_id,notice_tweet_id,nullif(viewer_account_id,''))
      ON CONFLICT (user_id,tweet_id) DO NOTHING;
  ELSE
    DELETE FROM bulletin.dismissals
      WHERE user_id=viewer_id AND (notice_tweet_id IS NULL OR tweet_id=notice_tweet_id);
  END IF;
END
$$;

ALTER TABLE bulletin.dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulletin.dismissals FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,DELETE ON bulletin.dismissals TO service_role;
REVOKE ALL ON FUNCTION public.get_bulletin_dismissals(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_bulletin_dismissal(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_dismissals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_bulletin_dismissal(uuid,text,text,boolean) TO service_role;
