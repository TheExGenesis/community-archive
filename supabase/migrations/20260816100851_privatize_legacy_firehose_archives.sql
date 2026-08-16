-- Fail closed on legacy Firehose Parquet objects before the universal rollout.
UPDATE storage.buckets
SET public = false
WHERE id IN ('firehose', 'firehose_private');
