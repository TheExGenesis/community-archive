-- Self-service keys for the public read API at analytics.community-archive.org/v1.
-- A consumer is the signed-in owner and keeps a stable ID across key rotation;
-- each key is a revocable credential. Only the SHA-256 of a key is stored. The
-- website issues and revokes keys; the gateway resolves them through a
-- server-to-server website route and never holds database credentials.
CREATE TABLE private.public_api_consumers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text CHECK (account_id ~ '^[0-9]{1,20}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE private.public_api_keys (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9]{16}$'),
  consumer_id uuid NOT NULL REFERENCES private.public_api_consumers(id) ON DELETE CASCADE,
  label text CHECK (label IS NULL OR length(label) BETWEEN 1 AND 80),
  key_sha256 text NOT NULL UNIQUE CHECK (key_sha256 ~ '^[0-9a-f]{64}$'),
  scopes text[] NOT NULL DEFAULT ARRAY['corpus:read']::text[]
    CHECK (cardinality(scopes) > 0 AND scopes <@ ARRAY['corpus:read']::text[]),
  requests_per_minute integer NOT NULL DEFAULT 60 CHECK (requests_per_minute BETWEEN 1 AND 6000),
  requests_per_day integer NOT NULL DEFAULT 20000 CHECK (requests_per_day BETWEEN 1 AND 5000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  -- Approximate: refreshed when the gateway re-verifies the key (at most every
  -- two minutes per key), never by a write on each data request.
  last_used_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX public_api_keys_consumer_idx ON private.public_api_keys(consumer_id, created_at DESC);

-- Public API keys. Callers are website server routes using the service role
-- after verifying the session; these functions enforce ownership and caps.
CREATE FUNCTION public.create_public_api_key(owner_user_id uuid, owner_account_id text, new_key_id text, new_key_sha256 text, key_label text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  consumer private.public_api_consumers;
  created private.public_api_keys;
BEGIN
  IF owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid API key owner' USING ERRCODE='22023';
  END IF;
  -- The upsert locks the consumer row, serializing concurrent creations by
  -- one owner so the caps below cannot be raced.
  INSERT INTO private.public_api_consumers AS c(user_id, account_id)
    VALUES(owner_user_id, nullif(owner_account_id,''))
    ON CONFLICT (user_id) DO UPDATE
      SET account_id = coalesce(EXCLUDED.account_id, c.account_id), updated_at = now()
    RETURNING * INTO consumer;
  IF consumer.status <> 'active' THEN
    RAISE EXCEPTION 'api_access_suspended' USING ERRCODE='42501';
  END IF;
  IF (SELECT count(*) FROM private.public_api_keys k
      WHERE k.consumer_id = consumer.id AND k.revoked_at IS NULL
        AND (k.expires_at IS NULL OR k.expires_at > now())) >= 5 THEN
    RAISE EXCEPTION 'active_key_limit' USING ERRCODE='P0001';
  END IF;
  IF (SELECT count(*) FROM private.public_api_keys k
      WHERE k.consumer_id = consumer.id AND k.created_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'daily_creation_limit' USING ERRCODE='P0001';
  END IF;
  INSERT INTO private.public_api_keys(id, consumer_id, label, key_sha256)
    VALUES(new_key_id, consumer.id, nullif(btrim(key_label),''), new_key_sha256)
    RETURNING * INTO created;
  RETURN jsonb_build_object(
    'id', created.id, 'consumer_id', created.consumer_id, 'label', created.label,
    'scopes', to_jsonb(created.scopes),
    'requests_per_minute', created.requests_per_minute,
    'requests_per_day', created.requests_per_day,
    'created_at', created.created_at, 'expires_at', created.expires_at,
    'last_used_at', created.last_used_at, 'revoked_at', created.revoked_at);
END
$$;

-- Active keys plus keys revoked in the last 30 days, newest first.
CREATE FUNCTION public.list_public_api_keys(owner_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', k.id, 'label', k.label, 'scopes', to_jsonb(k.scopes),
    'requests_per_minute', k.requests_per_minute,
    'requests_per_day', k.requests_per_day,
    'created_at', k.created_at, 'expires_at', k.expires_at,
    'last_used_at', k.last_used_at, 'revoked_at', k.revoked_at
  ) ORDER BY k.created_at DESC), '[]'::jsonb)
  FROM private.public_api_keys k
  JOIN private.public_api_consumers c ON c.id = k.consumer_id
  WHERE c.user_id = owner_user_id
    AND (k.revoked_at IS NULL OR k.revoked_at > now() - interval '30 days')
$$;

-- True when this owner's active key was revoked by this call.
CREATE FUNCTION public.revoke_public_api_key(owner_user_id uuid, target_key_id text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
  WITH revoked AS (
    UPDATE private.public_api_keys k SET revoked_at = now()
    FROM private.public_api_consumers c
    WHERE k.id = target_key_id AND k.consumer_id = c.id
      AND c.user_id = owner_user_id AND k.revoked_at IS NULL
    RETURNING k.id
  )
  SELECT EXISTS (SELECT 1 FROM revoked)
$$;

-- Gateway key resolution. Unknown, mismatched, revoked, expired, and suspended
-- keys are indistinguishable to the caller.
CREATE FUNCTION public.verify_public_api_key(target_key_id text, presented_key_sha256 text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE
  found_key private.public_api_keys;
  consumer_status text;
BEGIN
  SELECT k.* INTO found_key FROM private.public_api_keys k WHERE k.id = target_key_id;
  SELECT c.status INTO consumer_status
  FROM private.public_api_consumers c WHERE c.id = found_key.consumer_id;
  IF found_key.id IS NULL
    OR found_key.key_sha256 IS DISTINCT FROM presented_key_sha256
    OR found_key.revoked_at IS NOT NULL
    OR (found_key.expires_at IS NOT NULL AND found_key.expires_at <= now())
    OR consumer_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;
  UPDATE private.public_api_keys SET last_used_at = now()
  WHERE id = found_key.id
    AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute');
  RETURN jsonb_build_object('valid', true, 'key', jsonb_build_object(
    'id', found_key.id, 'consumer_id', found_key.consumer_id,
    'scopes', to_jsonb(found_key.scopes),
    'requests_per_minute', found_key.requests_per_minute,
    'requests_per_day', found_key.requests_per_day,
    'expires_at', found_key.expires_at));
END
$$;

ALTER TABLE private.public_api_consumers ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.public_api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.public_api_consumers, private.public_api_keys
  FROM PUBLIC, anon, authenticated, readclient, service_role;
GRANT SELECT, INSERT, UPDATE ON private.public_api_consumers, private.public_api_keys TO service_role;
REVOKE ALL ON FUNCTION public.create_public_api_key(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_public_api_keys(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_public_api_key(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_public_api_key(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_api_key(uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_public_api_keys(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_public_api_key(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_public_api_key(text,text) TO service_role;
