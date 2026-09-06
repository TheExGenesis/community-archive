ALTER TABLE private.canonical_ingest_receipts
  ADD COLUMN projected_payload_hash text NOT NULL,
  ADD CONSTRAINT canonical_ingest_receipts_projected_hash_check
    CHECK (projected_payload_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE private.canonical_ingest_entity_versions
  ADD COLUMN operation_rank smallint DEFAULT 1 NOT NULL,
  ADD CONSTRAINT canonical_ingest_entity_versions_operation_rank_check
    CHECK (operation_rank IN (1, 2));
