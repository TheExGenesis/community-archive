-- Raw user archives contain the complete uploaded JSON and must not be
-- downloadable anonymously. Upload/update/delete policies remain scoped to
-- the archive owner; this policy permits downloads only with a valid session.

BEGIN;

UPDATE storage.buckets
SET public = false
WHERE id = 'archives';

DROP POLICY IF EXISTS "Archives are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read archives" ON storage.objects;

CREATE POLICY "Authenticated users can read archives"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'archives');

COMMIT;
