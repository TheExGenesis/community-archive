-- Durable, content-free delivery control for the independent archive ->
-- ClickHouse sink. This migration deliberately does not enqueue completed
-- historical uploads: only the policy-aware archive processor creates rows.
CREATE TABLE private.archive_clickhouse_delivery (
  archive_upload_id bigint PRIMARY KEY,
  account_id text NOT NULL,
  tweet_ids text[] DEFAULT '{}'::text[] NOT NULL,
  delivery_state text DEFAULT 'pending'::text NOT NULL,
  attempt_count integer DEFAULT 0 NOT NULL,
  last_error_code text,
  next_attempt_at timestamptz DEFAULT now() NOT NULL,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT archive_clickhouse_delivery_account_id_check
    CHECK (account_id ~ '^(0|[1-9][0-9]*)$'),
  CONSTRAINT archive_clickhouse_delivery_tweet_ids_nonnull_check
    CHECK (array_position(tweet_ids, NULL::text) IS NULL),
  CONSTRAINT archive_clickhouse_delivery_tweet_ids_format_check
    CHECK (
      cardinality(tweet_ids) = 0
      OR array_to_string(tweet_ids, ',') ~ '^((0|[1-9][0-9]*),)*(0|[1-9][0-9]*)$'
    ),
  CONSTRAINT archive_clickhouse_delivery_state_check
    CHECK (delivery_state IN ('pending', 'delivered')),
  CONSTRAINT archive_clickhouse_delivery_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT archive_clickhouse_delivery_error_code_check
    CHECK (
      last_error_code IS NULL
      OR last_error_code ~ '^[a-z0-9_]{1,80}$'
    )
);

ALTER TABLE private.archive_clickhouse_delivery OWNER TO postgres;
ALTER TABLE private.archive_clickhouse_delivery ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.archive_clickhouse_delivery
  FROM PUBLIC, anon, authenticated, readclient, service_role;

CREATE INDEX archive_clickhouse_delivery_pending_idx
  ON private.archive_clickhouse_delivery (next_attempt_at, archive_upload_id)
  WHERE delivery_state = 'pending';

CREATE TRIGGER update_archive_clickhouse_delivery_updated_at
  BEFORE UPDATE ON private.archive_clickhouse_delivery
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE private.archive_clickhouse_delivery IS
  'Content-free stable-ID retry control for independent new archive ClickHouse delivery; never a source for content reconstruction or historical backfill.';
