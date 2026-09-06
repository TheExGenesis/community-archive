export const JOB_NAME = 'universal_policy_tombstones_v1'
export const CONFIRMATION = 'reconcile-policy-history'

export const REQUIRED_PHASES = [
  'indexes',
  'accounts',
  'tweets_authored',
  'tweets_retweet_payloads',
  'tweets_reply_usernames',
  'mentioned_users',
  'liked_tweets',
  'dependent_rows',
  'json_payloads',
  'archive_metadata',
] as const

export const VERIFICATION_PHASE = 'verification'

export type RequiredPhase = (typeof REQUIRED_PHASES)[number]

export type ReconcileOptions = {
  execute: boolean
  prepareOnly: boolean
  verifyOnly: boolean
  completeLiked: boolean
  batchSize: number
  maxLikedBatches: number
}

export type IndexSpec = {
  name: string
  table: string
  createSql: string
  expression: boolean
  definitionTerms: string[]
}

export type PolicyCheckpoint = {
  phase: string
  policy_version: string | null
  policy_fingerprint: string | null
}

export const INDEX_SPECS: IndexSpec[] = [
  {
    name: 'tweets_retweeted_username_lower_idx',
    table: 'tweets',
    expression: true,
    createSql: `
      CREATE INDEX CONCURRENTLY tweets_retweeted_username_lower_idx
      ON public.tweets ((lower(substring(
        full_text FROM '^RT @([A-Za-z0-9_]{1,15}):'
      ))))
      WHERE full_text ~ '^RT @[A-Za-z0-9_]{1,15}:'
    `,
    definitionTerms: [
      'public.tweets',
      'lower',
      'full_text',
      '^rt @[a-za-z0-9_]{1,15}:',
      'where',
    ],
  },
  {
    name: 'tweets_reply_to_username_lower_idx',
    table: 'tweets',
    expression: true,
    createSql: `
      CREATE INDEX CONCURRENTLY tweets_reply_to_username_lower_idx
      ON public.tweets ((lower(reply_to_username)))
      WHERE reply_to_username IS NOT NULL
    `,
    definitionTerms: [
      'public.tweets',
      'lower',
      'reply_to_username',
      'is not null',
    ],
  },
  {
    name: 'mentioned_users_screen_name_lower_idx',
    table: 'mentioned_users',
    expression: true,
    createSql: `
      CREATE INDEX CONCURRENTLY mentioned_users_screen_name_lower_idx
      ON public.mentioned_users ((lower(screen_name)))
      WHERE screen_name <> ''
    `,
    definitionTerms: [
      'public.mentioned_users',
      'lower',
      'screen_name',
      "screen_name <> ''",
    ],
  },
  {
    name: 'liked_tweets_author_account_id_idx',
    table: 'liked_tweets',
    expression: false,
    createSql: `
      CREATE INDEX CONCURRENTLY liked_tweets_author_account_id_idx
      ON public.liked_tweets (author_account_id)
      WHERE author_account_id IS NOT NULL
    `,
    definitionTerms: [
      'public.liked_tweets',
      'author_account_id',
      'is not null',
    ],
  },
]

function integerFlag(
  argv: string[],
  name: string,
  defaultValue: number,
  maximum: number,
): number {
  const prefix = `--${name}=`
  const raw = argv.find((argument) => argument.startsWith(prefix))
  if (!raw) return defaultValue

  const value = Number(raw.slice(prefix.length))
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`)
  }
  return value
}

export function parseOptions(
  argv: string[],
  env: NodeJS.ProcessEnv,
): ReconcileOptions {
  const execute = argv.includes('--execute')
  const prepareOnly = argv.includes('--prepare-only')
  const verifyOnly = argv.includes('--verify-only')
  const completeLiked = argv.includes('--complete-liked')

  const unknown = argv.filter(
    (argument) =>
      ![
        '--execute',
        '--prepare-only',
        '--verify-only',
        '--complete-liked',
        '--help',
      ].includes(argument) &&
      !argument.startsWith('--batch-size=') &&
      !argument.startsWith('--max-liked-batches='),
  )
  if (unknown.length > 0) {
    throw new Error(`Unknown argument: ${unknown[0]}`)
  }
  if (prepareOnly && verifyOnly) {
    throw new Error('--prepare-only and --verify-only cannot be combined')
  }
  if (verifyOnly && execute) {
    throw new Error(
      '--verify-only is read-only; only a full --execute run may record verification',
    )
  }
  if ((prepareOnly || completeLiked) && !execute) {
    throw new Error('--prepare-only and --complete-liked require --execute')
  }
  if (execute && env.CONFIRM_POLICY_HISTORY_RECONCILIATION !== CONFIRMATION) {
    throw new Error(
      `Set CONFIRM_POLICY_HISTORY_RECONCILIATION=${CONFIRMATION} to execute reconciliation`,
    )
  }

  return {
    execute,
    prepareOnly,
    verifyOnly,
    completeLiked,
    batchSize: integerFlag(argv, 'batch-size', 250000, 1000000),
    maxLikedBatches: integerFlag(argv, 'max-liked-batches', 10, 100000),
  }
}

export function normalizedIndexDefinition(definition: string): string {
  return definition
    .toLowerCase()
    .replace(/"/g, '')
    .replace(/::text/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function indexDefinitionMatches(
  definition: string,
  spec: IndexSpec,
): boolean {
  const normalized = normalizedIndexDefinition(definition)
  return spec.definitionTerms.every((term) =>
    normalized.includes(term.toLowerCase()),
  )
}

export function currentPolicyPhases(
  checkpoints: PolicyCheckpoint[],
  fingerprint: string,
): Set<string> {
  return new Set(
    checkpoints
      .filter(
        (checkpoint) =>
          checkpoint.policy_version === JOB_NAME &&
          checkpoint.policy_fingerprint === fingerprint,
      )
      .map((checkpoint) => checkpoint.phase),
  )
}

export function chargeLikedWriteBatch(
  chargedBatches: number,
  rowsWritten: number,
): number {
  return chargedBatches + (rowsWritten > 0 ? 1 : 0)
}

export function parseUnknownLikedCtidCheckpoint(
  checkpoint: string | null,
): string {
  const match = /^unknown-ctid:(\([0-9]+,[0-9]+\))$/.exec(checkpoint ?? '')
  if (!match) {
    throw new Error(
      `Invalid unknown liked-tweet CTID checkpoint: ${checkpoint ?? 'null'}`,
    )
  }
  return match[1]
}

export const BLOCKED_AUTHORED_TWEETS_SQL = `
  UPDATE public.tweets AS tweet
  SET created_at = '1970-01-01 00:00:00+00',
      full_text = '',
      favorite_count = 0,
      retweet_count = 0,
      reply_to_tweet_id = NULL,
      reply_to_user_id = NULL,
      reply_to_username = NULL,
      archive_upload_id = NULL,
      is_tombstone = true
  FROM policy_reconcile_blocked_accounts AS blocked
  WHERE tweet.account_id = blocked.account_id
    AND (
      tweet.is_tombstone IS NOT TRUE
      OR tweet.full_text <> ''
      OR tweet.favorite_count <> 0
      OR COALESCE(tweet.retweet_count, 0) <> 0
      OR tweet.reply_to_tweet_id IS NOT NULL
      OR tweet.reply_to_user_id IS NOT NULL
      OR tweet.reply_to_username IS NOT NULL
      OR tweet.archive_upload_id IS NOT NULL
    )
`

export const RETWEET_PAYLOAD_SQL = `
  UPDATE public.tweets AS tweet
  SET full_text = ''
  FROM policy_reconcile_blocked_usernames AS blocked
  WHERE tweet.full_text ~ '^RT @[A-Za-z0-9_]{1,15}:'
    AND lower(substring(
      tweet.full_text FROM '^RT @([A-Za-z0-9_]{1,15}):'
    )) = blocked.username_lower
    AND tweet.full_text <> ''
`

export const REPLY_USER_ID_SQL = `
  UPDATE public.tweets AS tweet
  SET reply_to_username = NULL
  FROM policy_reconcile_blocked_accounts AS blocked
  WHERE tweet.reply_to_username IS NOT NULL
    AND tweet.reply_to_user_id = blocked.account_id
`

export const REPLY_USERNAME_SQL = `
  UPDATE public.tweets AS tweet
  SET reply_to_username = NULL
  FROM policy_reconcile_blocked_usernames AS blocked
  WHERE tweet.reply_to_username IS NOT NULL
    AND blocked.username_lower = lower(tweet.reply_to_username)
`

export const PRESERVED_INBOUND_RELATIONSHIP_PREDICATES = {
  quote: 'quote_tweets.tweet_id = blocked_tweet.tweet_id',
  retweet: 'retweets.tweet_id = blocked_tweet.tweet_id',
} as const

export const FAST_LIKED_TWEETS_SESSION_SETTINGS = [
  "SET lock_timeout TO '5s'",
  "SET statement_timeout TO '20min'",
] as const

export const FAST_LIKED_TWEETS_STAGE_PLAN_SETTINGS = [
  "SET LOCAL work_mem TO '128MB'",
  'SET LOCAL enable_nestloop TO off',
  'SET LOCAL enable_mergejoin TO off',
] as const

export const POLICY_AUTHORITY_SHARE_LOCK_SQL = `
  LOCK TABLE public.optin, tes.blocked_scraping_users IN SHARE MODE
`

export const FAST_LIKED_TWEETS_TRIGGER_SUPPRESSION_SQL =
  'SET LOCAL session_replication_role TO replica'

export const FAST_LIKED_TWEETS_UNKNOWN_PLAN_SQL =
  'SET LOCAL enable_seqscan TO off'

// This is the only corpus join. Disabling nested-loop and merge-join planning
// makes PostgreSQL stage the small canonical intersection with one set-wise
// hash join instead of millions of random primary-key lookups.
export const FAST_LIKED_TWEETS_STAGE_SQL = `
  CREATE TEMP TABLE policy_reconcile_liked_canonical_stage
  ON COMMIT PRESERVE ROWS
  AS
  SELECT
    liked.tweet_id,
    tweet.account_id AS source_account_id,
    tweet.is_tombstone AS source_is_tombstone
  FROM public.liked_tweets AS liked
  JOIN public.tweets AS tweet
    ON tweet.tweet_id = liked.tweet_id
  WHERE liked.author_account_id IS NULL
    AND liked.is_tombstone IS FALSE
`

export const FAST_LIKED_TWEETS_BLOCKED_BATCH_SQL = `
  WITH candidates AS MATERIALIZED (
    SELECT liked.ctid AS source_ctid
    FROM public.liked_tweets AS liked
    JOIN policy_reconcile_blocked_accounts AS blocked
      ON blocked.account_id = liked.author_account_id
    WHERE liked.full_text <> '' OR liked.is_tombstone IS NOT TRUE
    ORDER BY liked.ctid
    LIMIT $1
  ), updated AS (
    UPDATE public.liked_tweets AS liked
    SET full_text = '',
        is_tombstone = true
    FROM candidates AS candidate
    WHERE liked.ctid = candidate.source_ctid
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::integer AS batch_rows
  FROM updated
`

export const FAST_LIKED_TWEETS_CANONICAL_BATCH_SQL = `
  WITH candidates AS MATERIALIZED (
    SELECT
      stage.tweet_id,
      stage.source_account_id,
      stage.source_is_tombstone,
      (
        stage.source_account_id IS NULL
        OR stage.source_is_tombstone IS TRUE
        OR blocked.account_id IS NOT NULL
      ) AS write_tombstone
    FROM policy_reconcile_liked_canonical_stage AS stage
    LEFT JOIN policy_reconcile_blocked_accounts AS blocked
      ON blocked.account_id = stage.source_account_id
    ORDER BY stage.tweet_id
    LIMIT $1
  ), updated AS (
    UPDATE public.liked_tweets AS liked
    SET author_account_id = candidate.source_account_id,
        full_text = CASE
          WHEN candidate.write_tombstone THEN ''
          ELSE liked.full_text
        END,
        is_tombstone = candidate.write_tombstone
    FROM candidates AS candidate
    WHERE liked.tweet_id = candidate.tweet_id
      AND liked.author_account_id IS NULL
      AND liked.is_tombstone IS FALSE
    RETURNING candidate.write_tombstone AS tombstone_written
  )
  SELECT
    pg_catalog.count(*)::integer AS batch_rows,
    pg_catalog.count(*) FILTER (
      WHERE updated.tombstone_written
    )::integer AS batch_tombstones_written
  FROM updated
`

export const FAST_LIKED_TWEETS_CANONICAL_DELETE_SQL = `
  DELETE FROM policy_reconcile_liked_canonical_stage AS stage
  WHERE stage.tweet_id IN (
    SELECT candidate.tweet_id
    FROM policy_reconcile_liked_canonical_stage AS candidate
    ORDER BY candidate.tweet_id
    LIMIT $1
  )
`

// Unknown authors need no canonical lookup: scan the heap in physical order,
// blank the payload, and advance the durable CTID cursor in the same bounded
// transaction. Writers and table-rewriting maintenance remain paused, so an
// interrupted run safely resumes after its last committed source page.
export const FAST_LIKED_TWEETS_UNKNOWN_BATCH_SQL = `
  WITH candidates AS MATERIALIZED (
    SELECT
      liked.ctid AS source_ctid
    FROM public.liked_tweets AS liked
    WHERE liked.ctid > $2::tid
      AND liked.author_account_id IS NULL
      AND liked.is_tombstone IS FALSE
    ORDER BY liked.ctid
    LIMIT $1
  ), updated AS (
    UPDATE public.liked_tweets AS liked
    SET full_text = '',
        is_tombstone = true
    FROM candidates AS candidate
    WHERE liked.ctid = candidate.source_ctid
    RETURNING candidate.source_ctid
  ), batch_stats AS (
    SELECT
      pg_catalog.count(*)::integer AS batch_rows,
      (
        SELECT candidate.source_ctid::text
        FROM candidates AS candidate
        ORDER BY candidate.source_ctid DESC
        LIMIT 1
      ) AS checkpoint_ctid
    FROM updated
  )
  UPDATE private.policy_backfill_progress AS checkpoint
  SET last_tweet_id = CASE
        WHEN stats.checkpoint_ctid IS NULL THEN checkpoint.last_tweet_id
        ELSE 'unknown-ctid:' || stats.checkpoint_ctid
      END,
      rows_processed = checkpoint.rows_processed + stats.batch_rows,
      tombstones_written =
        checkpoint.tombstones_written + stats.batch_rows,
      completed_at = CASE
        WHEN stats.batch_rows < $1
        THEN COALESCE(checkpoint.completed_at, pg_catalog.now())
        ELSE NULL
      END,
      updated_at = pg_catalog.now()
  FROM batch_stats AS stats
  WHERE checkpoint.job_name = 'legacy_liked_tweets_v1'
  RETURNING
    stats.batch_rows,
    0::integer AS batch_authors_backfilled,
    stats.batch_rows AS batch_tombstones_written,
    CASE
      WHEN stats.checkpoint_ctid IS NULL THEN checkpoint.last_tweet_id
      ELSE 'unknown-ctid:' || stats.checkpoint_ctid
    END AS checkpoint_tweet_id,
    (stats.batch_rows < $1) AS completed,
    checkpoint.rows_processed AS total_rows_processed
`
