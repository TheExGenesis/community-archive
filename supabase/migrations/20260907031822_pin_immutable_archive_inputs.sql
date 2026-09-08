BEGIN;
ALTER TABLE public.archive_upload ADD COLUMN storage_path text, ADD COLUMN storage_sha256 text;
ALTER TABLE public.archive_upload ADD CONSTRAINT archive_upload_storage_reference CHECK (
      (storage_path IS NULL AND storage_sha256 IS NULL) OR
      (storage_path IS NOT NULL AND storage_sha256 IS NOT NULL AND username IS NOT NULL
       AND storage_sha256 ~ '^[a-f0-9]{64}$'
       AND storage_path ~ '^[a-z0-9_]{1,15}/[a-f0-9-]{36}/archive[.]json$'
       AND split_part(storage_path, '/', 1) = lower(username))
    );

-- An accepted upload cannot be repointed to different bytes. Deletion remains
-- available through the established policy workflow.
CREATE OR REPLACE FUNCTION private.preserve_archive_storage_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.storage_path IS NOT NULL AND (
    NEW.storage_path IS DISTINCT FROM OLD.storage_path OR
    NEW.storage_sha256 IS DISTINCT FROM OLD.storage_sha256 OR
    NEW.account_id IS DISTINCT FROM OLD.account_id
  ) THEN
    RAISE EXCEPTION 'Archive input reference is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER preserve_archive_storage_reference
BEFORE UPDATE ON public.archive_upload FOR EACH ROW
EXECUTE FUNCTION private.preserve_archive_storage_reference();

DROP POLICY "Users can update their own archive" ON storage.objects;
CREATE POLICY "Users can update their own archive" ON "storage"."objects"
  FOR UPDATE TO "authenticated"
  USING (
    ("bucket_id" = 'archives'::"text")
    AND cardinality("storage"."foldername"("name")) = 1
    AND ("storage"."filename"("name") = 'archive.json'::"text")
    AND (
      "lower"(("storage"."foldername"("name"))[1]) =
      "lower"((SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text")))
    )
    AND public.assert_archive_upload_allowed(
      (SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'provider_id'::"text")),
      (SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text"))
    )
  )
  WITH CHECK (
    ("bucket_id" = 'archives'::"text")
    AND cardinality("storage"."foldername"("name")) = 1
    AND ("storage"."filename"("name") = 'archive.json'::"text")
    AND (
      "lower"(("storage"."foldername"("name"))[1]) =
      "lower"((SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text")))
    )
    AND public.assert_archive_upload_allowed(
      (SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'provider_id'::"text")),
      (SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'user_name'::"text"))
    )
  );


COMMIT;
