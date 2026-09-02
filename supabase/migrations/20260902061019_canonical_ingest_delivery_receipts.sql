-- Content-free idempotency and ordering state for the independent canonical
-- PostgreSQL queue consumer. Corpus payloads remain in their existing tables.
CREATE TABLE private.canonical_ingest_receipts (
  event_id text PRIMARY KEY,
  stream_id text UNIQUE NOT NULL,
  source text NOT NULL,
  source_batch_id_hash text NOT NULL,
  payload_hash text NOT NULL,
  mutation_count integer NOT NULL,
  committed_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT canonical_ingest_receipts_event_id_check
    CHECK (event_id ~ '^[0-9a-f]{64}$'),
  CONSTRAINT canonical_ingest_receipts_stream_id_check
    CHECK (stream_id ~ '^[0-9]+-[0-9]+$'),
  CONSTRAINT canonical_ingest_receipts_source_check
    CHECK (source IN ('extension', 'autorefresh', 'archive_upload', 'manual',
      'backfill', 'admin_delete', 'user_delete')),
  CONSTRAINT canonical_ingest_receipts_source_batch_hash_check
    CHECK (source_batch_id_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT canonical_ingest_receipts_payload_hash_check
    CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT canonical_ingest_receipts_mutation_count_check
    CHECK (mutation_count > 0 AND mutation_count <= 500)
);

CREATE TABLE private.canonical_ingest_entity_versions (
  entity_type text NOT NULL,
  entity_key_hash text NOT NULL,
  version numeric(40, 0) NOT NULL,
  event_id text NOT NULL,
  applied_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (entity_type, entity_key_hash),
  CONSTRAINT canonical_ingest_entity_versions_type_check
    CHECK (entity_type IN ('account', 'tweet_content', 'tweet_engagement',
      'media', 'url', 'mention', 'relationship', 'archive_upload')),
  CONSTRAINT canonical_ingest_entity_versions_key_hash_check
    CHECK (entity_key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT canonical_ingest_entity_versions_version_check
    CHECK (version >= 0),
  CONSTRAINT canonical_ingest_entity_versions_event_id_check
    CHECK (event_id ~ '^[0-9a-f]{64}$')
);

ALTER TABLE private.canonical_ingest_receipts OWNER TO postgres;
ALTER TABLE private.canonical_ingest_entity_versions OWNER TO postgres;
ALTER TABLE private.canonical_ingest_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.canonical_ingest_entity_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.canonical_ingest_receipts
  FROM PUBLIC, anon, authenticated, readclient, service_role;
REVOKE ALL ON TABLE private.canonical_ingest_entity_versions
  FROM PUBLIC, anon, authenticated, readclient, service_role;

COMMENT ON TABLE private.canonical_ingest_receipts IS
  'Content-free commit receipts for the canonical PostgreSQL queue consumer.';
COMMENT ON TABLE private.canonical_ingest_entity_versions IS
  'Content-free latest-version guards for idempotent canonical PostgreSQL projection.';
