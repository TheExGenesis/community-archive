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
    batchSize: integerFlag(argv, 'batch-size', 5000, 10000),
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

export const REPLY_USERNAME_SQL = `
  UPDATE public.tweets AS tweet
  SET reply_to_username = NULL
  WHERE tweet.reply_to_username IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM policy_reconcile_blocked_accounts AS blocked
        WHERE blocked.account_id = tweet.reply_to_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM policy_reconcile_blocked_usernames AS blocked
        WHERE blocked.username_lower = lower(tweet.reply_to_username)
      )
    )
`

export const PRESERVED_INBOUND_RELATIONSHIP_PREDICATES = {
  quote: 'quote_tweets.tweet_id = blocked_tweet.tweet_id',
  retweet: 'retweets.tweet_id = blocked_tweet.tweet_id',
} as const
