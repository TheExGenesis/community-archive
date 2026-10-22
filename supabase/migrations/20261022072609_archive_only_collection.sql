-- Collection preference is separate from membership and destructive policy blocks.
-- No row preserves legacy behavior. Never feed this table into policy_account_is_blocked.
CREATE TABLE public.account_collection_preferences (
  account_id text PRIMARY KEY CHECK (account_id ~ '^[1-9][0-9]{0,19}$'),
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_collection_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_collection_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.account_collection_preferences TO service_role;
COMMENT ON TABLE public.account_collection_preferences IS
  'Owner collection preference. False discards automatic observations without deleting content or blocking owner uploads. Absent rows preserve legacy behavior.';
