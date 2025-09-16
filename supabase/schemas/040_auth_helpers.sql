-- Helper functions used by RLS policies; safe to declare here
-- to avoid coupling to service-managed migrations.

CREATE OR REPLACE FUNCTION "auth"."jwt"() RETURNS jsonb
    LANGUAGE sql STABLE
AS $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
$$;

CREATE OR REPLACE FUNCTION "auth"."uid"() RETURNS uuid
    LANGUAGE sql STABLE
AS $$
  select nullif((auth.jwt() ->> 'sub'), '')::uuid;
$$;

