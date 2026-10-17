-- Account identity must come from the Twitter/X OAuth identity, never from
-- raw_user_meta_data, which any signed-in user can rewrite with
-- supabase.auth.updateUser({ data: ... }).
--
-- 1. public.sync_meta_data() runs in production as
--    sync_user_meta_data BEFORE INSERT OR UPDATE ON auth.users and copied
--    raw_user_meta_data.provider_id/user_name into raw_app_meta_data on every
--    update. A user could therefore set user_metadata.provider_id to another
--    account, refresh the session, and receive that account in
--    app_metadata.provider_id, which RLS, storage policies and the archive
--    RPCs trust.
-- 2. tes.get_current_account_id() resolved the caller's account from
--    raw_user_meta_data.provider_id.

CREATE OR REPLACE FUNCTION "public"."sync_meta_data"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_app jsonb := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb);
    v_provider_id text;
    v_user_name text;
BEGIN
    -- GoTrue writes auth.identities from the OAuth provider's response, and
    -- users cannot edit it.
    SELECT i.provider_id,
           COALESCE(NULLIF(i.identity_data->>'user_name', ''),
                    NULLIF(i.identity_data->>'preferred_username', ''))
    INTO v_provider_id, v_user_name
    FROM auth.identities i
    WHERE i.user_id = NEW.id
      AND i.provider IN ('twitter', 'x')
    ORDER BY i.created_at, i.id
    LIMIT 1;

    IF v_provider_id IS NOT NULL THEN
        v_app := v_app || jsonb_build_object('provider_id', v_provider_id);
        IF v_user_name IS NOT NULL THEN
            v_app := v_app || jsonb_build_object('user_name', v_user_name);
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        -- GoTrue's OAuth sign-up inserts the user before its identity, with
        -- raw_user_meta_data set to the provider's claims. app_metadata.provider
        -- is set by GoTrue, so a client sign-up (provider 'email', 'phone' or
        -- anonymous) never reaches this branch.
        IF v_app->>'provider' IN ('twitter', 'x') THEN
            v_app := v_app || jsonb_strip_nulls(jsonb_build_object(
                'provider_id', NULLIF(NEW.raw_user_meta_data->>'provider_id', ''),
                'user_name', NULLIF(NEW.raw_user_meta_data->>'user_name', '')
            ));
        END IF;
    ELSE
        -- Without a Twitter identity, keep the values the row was created with.
        v_app := (v_app - 'provider_id' - 'user_name') || jsonb_strip_nulls(jsonb_build_object(
            'provider_id', OLD.raw_app_meta_data->'provider_id',
            'user_name', OLD.raw_app_meta_data->'user_name'
        ));
    END IF;

    NEW.raw_app_meta_data := v_app;
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."sync_meta_data"() OWNER TO "postgres";

-- Production created this trigger outside migrations. Create it where it is
-- missing (local, staging) so every environment enforces the same rule, and
-- leave the production trigger untouched.
DO $sync_user_meta_data$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgrelid = 'auth.users'::regclass
          AND tgname = 'sync_user_meta_data'
          AND NOT tgisinternal
    ) THEN
        CREATE TRIGGER "sync_user_meta_data"
            BEFORE INSERT OR UPDATE ON "auth"."users"
            FOR EACH ROW EXECUTE FUNCTION "public"."sync_meta_data"();
    END IF;
END;
$sync_user_meta_data$;

CREATE OR REPLACE FUNCTION "tes"."get_current_account_id"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    SELECT a.account_id INTO v_account_id
    FROM auth.identities i
    JOIN public.account a ON a.account_id = i.provider_id
    WHERE i.user_id = auth.uid()
      AND i.provider IN ('twitter', 'x')
    ORDER BY i.created_at, i.id
    LIMIT 1;

    RETURN v_account_id;
END;
$$;

ALTER FUNCTION "tes"."get_current_account_id"() OWNER TO "postgres";
