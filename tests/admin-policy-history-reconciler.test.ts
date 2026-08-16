import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  BLOCKED_AUTHORED_TWEETS_SQL,
  CONFIRMATION,
  FAST_LIKED_TWEETS_BLOCKED_BATCH_SQL,
  FAST_LIKED_TWEETS_CANONICAL_BATCH_SQL,
  FAST_LIKED_TWEETS_CANONICAL_DELETE_SQL,
  FAST_LIKED_TWEETS_SESSION_SETTINGS,
  FAST_LIKED_TWEETS_STAGE_PLAN_SETTINGS,
  FAST_LIKED_TWEETS_STAGE_SQL,
  FAST_LIKED_TWEETS_TRIGGER_SUPPRESSION_SQL,
  FAST_LIKED_TWEETS_UNKNOWN_BATCH_SQL,
  INDEX_SPECS,
  JOB_NAME,
  POLICY_AUTHORITY_SHARE_LOCK_SQL,
  PRESERVED_INBOUND_RELATIONSHIP_PREDICATES,
  REPLY_USER_ID_SQL,
  REPLY_USERNAME_SQL,
  REQUIRED_PHASES,
  RETWEET_PAYLOAD_SQL,
  VERIFICATION_PHASE,
  chargeLikedWriteBatch,
  currentPolicyPhases,
  indexDefinitionMatches,
  parseOptions,
} from '../scripts/policy-history-reconciler'

describe('historical policy reconciler', () => {
  test('keeps the fast policy metadata backfill ahead of cleanup triggers', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'supabase/migrations/20260816100934_enforce_universal_policy_tombstones_fast.sql',
      ),
      'utf8',
    )
    expect(
      migration.indexOf(
        'LOCK TABLE\n  public.account,\n  public.profile,\n  public.enriched_tweets,',
      ),
    ).toBeLessThan(migration.indexOf('ALTER TABLE public.mentioned_users'))
    expect(migration.indexOf('BEGIN;')).toBeLessThan(
      migration.indexOf(
        'LOCK TABLE\n  public.account,\n  public.profile,\n  public.enriched_tweets,',
      ),
    )
    expect(migration.indexOf('public.enriched_tweets,')).toBeLessThan(
      migration.indexOf('public.tweets,'),
    )
    const backfill = migration.indexOf(
      'UPDATE tes.blocked_scraping_users AS blocked',
    )
    const cleanupTrigger = migration.indexOf(
      'CREATE TRIGGER apply_policy_block_tombstone',
    )

    expect(backfill).toBeGreaterThan(0)
    expect(cleanupTrigger).toBeGreaterThan(backfill)
    const boundedBackfill = migration.slice(backfill, cleanupTrigger)
    expect(boundedBackfill).toContain(
      'WHERE account.account_id = blocked.account_id',
    )
    expect(boundedBackfill).not.toContain(
      'FROM public.all_account AS account\nLEFT JOIN',
    )
  })

  test('is a dry run by default and requires an exact execute confirmation', () => {
    expect(parseOptions([], {})).toEqual({
      execute: false,
      prepareOnly: false,
      verifyOnly: false,
      completeLiked: false,
      batchSize: 250000,
      maxLikedBatches: 10,
    })

    expect(() => parseOptions(['--execute'], {})).toThrow(
      `CONFIRM_POLICY_HISTORY_RECONCILIATION=${CONFIRMATION}`,
    )
    expect(
      parseOptions(['--execute', '--complete-liked'], {
        CONFIRM_POLICY_HISTORY_RECONCILIATION: CONFIRMATION,
      }).completeLiked,
    ).toBe(true)
    expect(() =>
      parseOptions(['--execute', '--verify-only'], {
        CONFIRM_POLICY_HISTORY_RECONCILIATION: CONFIRMATION,
      }),
    ).toThrow('--verify-only is read-only')
  })

  test('bounds liked-tweet keyset batches', () => {
    expect(
      parseOptions(['--batch-size=1000000', '--max-liked-batches=100000'], {})
        .batchSize,
    ).toBe(1000000)
    expect(() => parseOptions(['--batch-size=1000001'], {})).toThrow(
      'batch-size must be an integer between 1 and 1000000',
    )
    expect(() => parseOptions(['--max-liked-batches=0'], {})).toThrow(
      'max-liked-batches must be an integer between 1 and 100000',
    )
  })

  test('does not charge empty liked completion probes to the write budget', () => {
    let chargedBatches = chargeLikedWriteBatch(0, 0)
    expect(chargedBatches).toBe(0)

    chargedBatches = chargeLikedWriteBatch(chargedBatches, 250000)
    expect(chargedBatches).toBe(1)
    expect(chargeLikedWriteBatch(chargedBatches, 0)).toBe(1)

    const operator = readFileSync(
      join(process.cwd(), 'scripts/reconcile_policy_history.mts'),
      'utf8',
    )
    expect(operator).not.toContain('batches < batchLimit')
    expect(operator.match(/writeBatches < batchLimit/g)).toHaveLength(3)
  })

  test('owns three exact expression indexes plus the liked author index', () => {
    expect(INDEX_SPECS.map((index) => index.name)).toEqual([
      'tweets_retweeted_username_lower_idx',
      'tweets_reply_to_username_lower_idx',
      'mentioned_users_screen_name_lower_idx',
      'liked_tweets_author_account_id_idx',
    ])
    expect(INDEX_SPECS.filter((index) => index.expression)).toHaveLength(3)
    for (const index of INDEX_SPECS) {
      expect(index.createSql).toContain('CREATE INDEX CONCURRENTLY')
      expect(index.createSql).not.toContain('idx_tweets_full_text_trgm')
      expect(indexDefinitionMatches(index.createSql, index)).toBe(true)
    }
  })

  test('uses the finalization phase and policy-version contract', () => {
    expect(JOB_NAME).toBe('universal_policy_tombstones_v1')
    expect(REQUIRED_PHASES).toEqual([
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
    ])
    expect(VERIFICATION_PHASE).toBe('verification')
  })

  test('rejects checkpoints from an older consent snapshot', () => {
    const phases = currentPolicyPhases(
      [
        {
          phase: 'accounts',
          policy_version: JOB_NAME,
          policy_fingerprint: 'old',
        },
        {
          phase: 'tweets_authored',
          policy_version: JOB_NAME,
          policy_fingerprint: 'current',
        },
        {
          phase: 'indexes',
          policy_version: 'old_version',
          policy_fingerprint: 'current',
        },
      ],
      'current',
    )

    expect([...phases]).toEqual(['tweets_authored'])
  })

  test('tombstones blocked outer tweets without deleting their stable IDs', () => {
    expect(BLOCKED_AUTHORED_TWEETS_SQL).toContain(
      'UPDATE public.tweets AS tweet',
    )
    expect(BLOCKED_AUTHORED_TWEETS_SQL).toContain('is_tombstone = true')
    expect(BLOCKED_AUTHORED_TWEETS_SQL).not.toContain(
      'DELETE FROM public.tweets',
    )
  })

  test('scrubs copied identity while retaining allowed outer relationships', () => {
    expect(RETWEET_PAYLOAD_SQL).toContain("SET full_text = ''")
    expect(REPLY_USER_ID_SQL).toContain(
      'tweet.reply_to_user_id = blocked.account_id',
    )
    expect(REPLY_USERNAME_SQL).toContain('SET reply_to_username = NULL')
    expect(REPLY_USERNAME_SQL).toContain(
      'blocked.username_lower = lower(tweet.reply_to_username)',
    )
    expect(REPLY_USERNAME_SQL).not.toContain('OR EXISTS')
    expect(REPLY_USERNAME_SQL).not.toContain('reply_to_tweet_id = NULL')
    expect(PRESERVED_INBOUND_RELATIONSHIP_PREDICATES).toEqual({
      quote: 'quote_tweets.tweet_id = blocked_tweet.tweet_id',
      retweet: 'retweets.tweet_id = blocked_tweet.tweet_id',
    })
  })

  test('bounds every liked write after one set-wise canonical stage', () => {
    expect(FAST_LIKED_TWEETS_STAGE_SQL).toContain(
      'CREATE TEMP TABLE policy_reconcile_liked_canonical_stage',
    )
    expect(FAST_LIKED_TWEETS_STAGE_SQL).toContain('JOIN public.tweets AS tweet')
    expect(FAST_LIKED_TWEETS_STAGE_PLAN_SETTINGS).toEqual([
      "SET LOCAL work_mem TO '128MB'",
      'SET LOCAL enable_nestloop TO off',
      'SET LOCAL enable_mergejoin TO off',
    ])
    expect(FAST_LIKED_TWEETS_SESSION_SETTINGS).toContain(
      "SET statement_timeout TO '20min'",
    )
    expect(FAST_LIKED_TWEETS_SESSION_SETTINGS.join(' ')).not.toContain(
      "statement_timeout TO '0'",
    )
    expect(FAST_LIKED_TWEETS_BLOCKED_BATCH_SQL).toContain('LIMIT $1')
    expect(FAST_LIKED_TWEETS_CANONICAL_BATCH_SQL).toContain('LIMIT $1')
    expect(FAST_LIKED_TWEETS_CANONICAL_BATCH_SQL).toContain(
      'ELSE liked.full_text',
    )
    expect(FAST_LIKED_TWEETS_CANONICAL_DELETE_SQL).toContain('LIMIT $1')
    expect(FAST_LIKED_TWEETS_UNKNOWN_BATCH_SQL).toContain('LIMIT $1')
    expect(FAST_LIKED_TWEETS_UNKNOWN_BATCH_SQL).toContain(
      "'unknown-ctid:' || stats.checkpoint_ctid",
    )
    expect(FAST_LIKED_TWEETS_UNKNOWN_BATCH_SQL).toContain("SET full_text = ''")
    expect(FAST_LIKED_TWEETS_UNKNOWN_BATCH_SQL).not.toContain('public.tweets')
    expect(
      [
        FAST_LIKED_TWEETS_BLOCKED_BATCH_SQL,
        FAST_LIKED_TWEETS_CANONICAL_BATCH_SQL,
        FAST_LIKED_TWEETS_UNKNOWN_BATCH_SQL,
      ].join('\n'),
    ).not.toContain('DELETE FROM public.liked_tweets')
  })

  test('serializes policy snapshots before each policy-dependent write', () => {
    expect(POLICY_AUTHORITY_SHARE_LOCK_SQL).toContain(
      'LOCK TABLE public.optin, tes.blocked_scraping_users IN SHARE MODE',
    )
    expect(FAST_LIKED_TWEETS_TRIGGER_SUPPRESSION_SQL).toBe(
      'SET LOCAL session_replication_role TO replica',
    )

    const operator = readFileSync(
      join(process.cwd(), 'scripts/reconcile_policy_history.mts'),
      'utf8',
    )
    const helperStart = operator.indexOf('const runPolicyLockedBatch = async')
    const helperEnd = operator.indexOf('let blockedComplete', helperStart)
    const helper = operator.slice(helperStart, helperEnd)
    expect(helper.indexOf('POLICY_AUTHORITY_SHARE_LOCK_SQL')).toBeLessThan(
      helper.indexOf('refreshBlockedIdentities(db)'),
    )
    expect(helper.indexOf('refreshBlockedIdentities(db)')).toBeLessThan(
      helper.indexOf('FAST_LIKED_TWEETS_TRIGGER_SUPPRESSION_SQL'),
    )
    expect(operator).not.toContain(
      'FROM private.reconcile_legacy_liked_tweets_batch(1)',
    )
  })
})
