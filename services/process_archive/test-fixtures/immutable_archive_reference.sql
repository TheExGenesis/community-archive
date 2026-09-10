-- Focused SQL assertions, run after the immutable-input migration in a
-- disposable database. Changes are rolled back. No corpus scan is performed.
BEGIN;
DO $$
DECLARE upload_id bigint;
BEGIN
  INSERT INTO public.archive_upload(account_id,username,storage_path,storage_sha256)
  VALUES ('123','fixture_owner','fixture_owner/12345678-1234-1234-1234-123456789abc/archive.json',repeat('a',64))
  RETURNING id INTO upload_id;
  BEGIN
    UPDATE public.archive_upload SET storage_sha256=repeat('b',64) WHERE id=upload_id;
    RAISE EXCEPTION 'Expected immutable-reference rejection';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.archive_upload SET storage_path=NULL,storage_sha256=NULL WHERE id=upload_id;
    RAISE EXCEPTION 'Expected reference-clearing rejection';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.archive_upload(account_id,username,storage_path,storage_sha256)
    VALUES ('123','fixture_owner','another_owner/12345678-1234-1234-1234-123456789abc/archive.json',repeat('a',64));
    RAISE EXCEPTION 'Expected cross-owner reference rejection';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
ROLLBACK;
