-- Keep server-written app_metadata for users without a Twitter/X identity.
--
-- 20261016192016 restored OLD.raw_app_meta_data's provider_id/user_name on
-- every UPDATE of a user with no Twitter/X identity. auth.admin.createUser
-- inserts the user and then applies app_metadata with an UPDATE, so the
-- dev-login mock users (src/app/api/auth/dev-login) lost the provider_id and
-- user_name that RLS, storage policies and the archive_upload owner trigger
-- rely on. The vulnerability 20261016192016 fixed was copying
-- raw_user_meta_data into raw_app_meta_data; that copy stays removed.

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
    END IF;
    -- An UPDATE without a Twitter identity keeps NEW.raw_app_meta_data as
    -- written. Clients cannot write it (supabase.auth.updateUser changes
    -- raw_user_meta_data only), so a change to it comes from the service role
    -- or GoTrue, e.g. the app_metadata auth.admin.createUser applies after
    -- its INSERT.

    NEW.raw_app_meta_data := v_app;
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."sync_meta_data"() OWNER TO "postgres";
