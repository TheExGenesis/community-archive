import {
  BLOCKED_AUTHORED_TWEETS_SQL,
  CONFIRMATION,
  INDEX_SPECS,
  JOB_NAME,
  PRESERVED_INBOUND_RELATIONSHIP_PREDICATES,
  REPLY_USERNAME_SQL,
  REQUIRED_PHASES,
  RETWEET_PAYLOAD_SQL,
  VERIFICATION_PHASE,
  currentPolicyPhases,
  indexDefinitionMatches,
  parseOptions,
} from '../scripts/policy-history-reconciler'

describe('historical policy reconciler', () => {
  test('is a dry run by default and requires an exact execute confirmation', () => {
    expect(parseOptions([], {})).toEqual({
      execute: false,
      prepareOnly: false,
      verifyOnly: false,
      completeLiked: false,
      batchSize: 5000,
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
      parseOptions(['--batch-size=10000', '--max-liked-batches=100000'], {})
        .batchSize,
    ).toBe(10000)
    expect(() => parseOptions(['--batch-size=10001'], {})).toThrow(
      'batch-size must be an integer between 1 and 10000',
    )
    expect(() => parseOptions(['--max-liked-batches=0'], {})).toThrow(
      'max-liked-batches must be an integer between 1 and 100000',
    )
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
    expect(REPLY_USERNAME_SQL).toContain('SET reply_to_username = NULL')
    expect(REPLY_USERNAME_SQL).not.toContain('reply_to_tweet_id = NULL')
    expect(PRESERVED_INBOUND_RELATIONSHIP_PREDICATES).toEqual({
      quote: 'quote_tweets.tweet_id = blocked_tweet.tweet_id',
      retweet: 'retweets.tweet_id = blocked_tweet.tweet_id',
    })
  })
})
