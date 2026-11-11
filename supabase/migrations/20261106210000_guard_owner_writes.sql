-- Guard the owner-writable columns that other parts of the system treat as
-- trusted facts.
--
-- archive_upload: RLS lets an owner write their own rows, and upload_phase =
-- 'completed' is what public.account, user_directory, the membership snapshot
-- and agent-search eligibility treat as "this archive was processed". Only
-- the service-role worker may move a row to committing/completed, and a row
-- that is committing/completed may not have its phase changed by its owner.
--
-- all_account: the browser upload upserts the caller's account row, and
-- username is used to resolve opt-outs and serving membership. For
-- non-service callers the username is pinned to the trusted
-- app_metadata.user_name (archives can carry an old handle), and
-- is_tombstone cannot be changed, so an owner cannot undo a policy tombstone.
--
-- Trusted callers match private.enforce_archive_upload_owner: the
-- service_role JWT and direct database logins.

CREATE OR REPLACE FUNCTION private.guard_archive_upload_phase()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_role text := auth.jwt()->>'role';
BEGIN
  IF v_role = 'service_role'
     OR (v_role IS NULL AND session_user <> 'authenticator') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.upload_phase IS DISTINCT FROM 'uploading'::public.upload_phase_enum THEN
      RAISE EXCEPTION 'archive uploads must start in the uploading phase'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.upload_phase IS DISTINCT FROM OLD.upload_phase THEN
    IF OLD.upload_phase IN ('committing', 'completed')
       OR NEW.upload_phase NOT IN ('uploading', 'ready_for_commit', 'failed') THEN
      RAISE EXCEPTION 'archive upload phase can only be set to uploading, ready_for_commit or failed by its owner'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION private.guard_archive_upload_phase() OWNER TO postgres;

-- SECURITY DEFINER so the policy check runs regardless of the caller's grants.
CREATE OR REPLACE FUNCTION private.guard_all_account_owner_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_role text := auth.jwt()->>'role';
  v_user_name text := NULLIF(BTRIM(auth.jwt()->'app_metadata'->>'user_name'), '');
BEGIN
  IF v_role = 'service_role'
     OR (v_role IS NULL AND session_user <> 'authenticator') THEN
    RETURN NEW;
  END IF;

  IF v_user_name IS NULL THEN
    RAISE EXCEPTION 'account rows can only be written with a trusted handle'
      USING ERRCODE = '42501';
  END IF;
  NEW.username := v_user_name;

  -- A policy tombstone stays while the stable account ID is blocked; once
  -- the block is lifted the owner's upload may hydrate the placeholder.
  IF TG_OP = 'INSERT' THEN
    NEW.is_tombstone := false;
  ELSIF OLD.is_tombstone THEN
    NEW.is_tombstone := public.policy_account_is_blocked(NEW.account_id, NULL);
  ELSE
    NEW.is_tombstone := false;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION private.guard_all_account_owner_write() OWNER TO postgres;

CREATE OR REPLACE TRIGGER guard_archive_upload_phase
BEFORE INSERT OR UPDATE OF upload_phase ON public.archive_upload
FOR EACH ROW EXECUTE FUNCTION private.guard_archive_upload_phase();

CREATE OR REPLACE TRIGGER guard_all_account_owner_write
BEFORE INSERT OR UPDATE ON public.all_account
FOR EACH ROW EXECUTE FUNCTION private.guard_all_account_owner_write();
