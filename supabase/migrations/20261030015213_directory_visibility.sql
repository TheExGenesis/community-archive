-- Editorial directory visibility only; never changes membership or consent.
CREATE TABLE public.directory_hidden_users (
    visibility_key text PRIMARY KEY,
    account_id text,
    username text NOT NULL,
    hidden_by uuid,
    hidden_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT directory_hidden_users_identity CHECK (
        username ~ '^[a-z0-9_]{1,15}$' AND
        ((account_id IS NOT NULL AND account_id ~ '^[0-9]{1,20}$'
          AND visibility_key = 'id:' || account_id)
         OR (account_id IS NULL AND visibility_key = 'username:' || username))
    )
);

ALTER TABLE public.directory_hidden_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.directory_hidden_users FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.directory_hidden_users TO service_role;

-- Requested by Xiq; numeric identities verified in public.user_directory.
INSERT INTO public.directory_hidden_users (visibility_key, account_id, username) VALUES
    ('id:2085838061347217408', '2085838061347217408', 'bot'),
    ('id:1077698894820229126', '1077698894820229126', 'postcoleonmain');
