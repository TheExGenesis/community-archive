-- Bind the client-written archive_upload.username and storage_path to the
-- caller's trusted identity.
--
-- RLS already requires archive_upload.account_id to equal
-- app_metadata.provider_id, which 20261016192016 derives from auth.identities.
-- username was still free text, and the archive worker reads the object in
-- the folder it names with the service role. A signed-in user could therefore
-- insert a row naming another user's handle and storage_path.
--
-- The check applies only to rows a user writes. Existing rows are not
-- validated: about two dozen production rows predate a handle rename, and an
-- UPDATE that leaves username and storage_path unchanged is not checked.

-- Trusted callers are the service_role JWT and direct database logins, which
-- have no request JWT and are not PostgREST's authenticator. current_role is
-- not used: inside a SECURITY DEFINER caller it is the function owner.
CREATE OR REPLACE FUNCTION private.enforce_archive_upload_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_role text := auth.jwt()->>'role';
  v_user_name text := auth.jwt()->'app_metadata'->>'user_name';
BEGIN
  IF v_role = 'service_role'
     OR (v_role IS NULL AND session_user <> 'authenticator') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.username IS NOT DISTINCT FROM OLD.username
     AND NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path THEN
    RETURN NEW;
  END IF;

  IF NULLIF(BTRIM(v_user_name), '') IS NULL
     OR lower(NEW.username) IS DISTINCT FROM lower(v_user_name) THEN
    RAISE EXCEPTION 'archive upload username does not match the authenticated account'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.storage_path IS NOT NULL
     AND split_part(NEW.storage_path, '/', 1) IS DISTINCT FROM lower(NEW.username) THEN
    RAISE EXCEPTION 'archive storage path is outside the authenticated account folder'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION private.enforce_archive_upload_owner() OWNER TO postgres;

CREATE OR REPLACE TRIGGER enforce_archive_upload_owner
BEFORE INSERT OR UPDATE OF username, storage_path ON public.archive_upload
FOR EACH ROW EXECUTE FUNCTION private.enforce_archive_upload_owner();
