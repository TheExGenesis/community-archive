import { ArchiveUploadProcessor } from '../../services/process_archive/process_archive_upload'
import { createTestClient } from './fixtures/test-db-utils'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const postgres = require('postgres') as typeof import('postgres').default

const archiveFor = (accountId: string, username: string, tweets: any[]) => ({
  account: [
    {
      account: {
        accountId,
        username,
        createdVia: 'twitter_archive',
        createdAt: '2020-01-01T00:00:00.000Z',
        accountDisplayName: username,
      },
    },
  ],
  profile: [],
  tweets: tweets.map((tweet) => ({ tweet })),
  like: [],
  following: [],
  follower: [],
})

const tweet = (
  id: string,
  fullText: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  id_str: id,
  created_at: '2020-01-02T00:00:00.000Z',
  full_text: fullText,
  favorite_count: 0,
  retweet_count: 0,
  entities: { urls: [], user_mentions: [], media: [] },
  ...extra,
})

describe('archive nested policy tombstones', () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const allowedId = `81${suffix}`
  const blockedId = `82${suffix}`
  const allowedChildId = `83${suffix}`
  const blockedOuterId = `84${suffix}`
  const quoteOuterId = `85${suffix}`
  const retweetOuterId = `86${suffix}`
  const blockedTargetId = `87${suffix}`
  const allowedChildTweetId = `88${suffix}`
  const blockedOuterTweetId = `89${suffix}`
  const usernames = {
    allowed: `a${suffix.slice(-10)}`,
    blocked: `b${suffix.slice(-10)}`,
    allowedChild: `c${suffix.slice(-10)}`,
    blockedOuter: `d${suffix.slice(-10)}`,
  }
  let sql: ReturnType<typeof postgres>

  beforeAll(async () => {
    // Reuse the suite's production-target guard before opening direct SQL.
    createTestClient()
    sql = postgres(process.env.TESTS_POSTGRES_CONNECTION_STRING!, {
      max: 2,
      prepare: false,
    })
  })

  afterAll(async () => {
    const ids = [allowedId, blockedId, allowedChildId, blockedOuterId]
    const tweetIds = [
      quoteOuterId,
      retweetOuterId,
      blockedTargetId,
      allowedChildTweetId,
      blockedOuterTweetId,
    ]
    await sql`DELETE FROM tes.blocked_scraping_users WHERE account_id IN ${sql(ids)}`
    await sql`DELETE FROM public.quote_tweets WHERE tweet_id IN ${sql(tweetIds)} OR quoted_tweet_id IN ${sql(tweetIds)}`
    await sql`DELETE FROM public.retweets WHERE tweet_id IN ${sql(tweetIds)} OR retweeted_tweet_id IN ${sql(tweetIds)}`
    await sql`DELETE FROM public.archive_upload WHERE account_id IN ${sql(ids)}`
    await sql`UPDATE public.tweets SET is_tombstone = false WHERE tweet_id IN ${sql(tweetIds)}`
    await sql`DELETE FROM public.tweets WHERE tweet_id IN ${sql(tweetIds)}`
    await sql`
      UPDATE public.all_account
      SET created_via = 'test', username = account_id, created_at = now(),
          account_display_name = '', is_tombstone = false
      WHERE account_id IN ${sql(ids)}
    `
    await sql`DELETE FROM public.all_account WHERE account_id IN ${sql(ids)}`
    await sql`
      DELETE FROM private.admin_jobs
      WHERE args->>'account_id' IN ${sql(ids)}
         OR args->>'username' IN ${sql(Object.values(usernames))}
    `
    await sql.end()
  })

  it('keeps allowed quote/retweet interactions and tombstones blocked targets', async () => {
    await sql`
      INSERT INTO public.all_account (
        account_id, created_via, username, created_at, account_display_name
      ) VALUES
        (${allowedId}, 'test', ${usernames.allowed}, now(), 'Allowed'),
        (${blockedId}, 'test', ${usernames.blocked}, now(), 'Blocked')
    `
    await sql`
      INSERT INTO public.tweets (
        tweet_id, account_id, created_at, full_text, favorite_count, retweet_count
      ) VALUES (${blockedTargetId}, ${blockedId}, now(), 'blocked child text', 0, 0)
    `
    await sql`
      INSERT INTO tes.blocked_scraping_users (account_id, block_source)
      VALUES (${blockedId}, 'admin')
    `
    const [upload] = await sql`
      INSERT INTO public.archive_upload (
        account_id, archive_at, username, upload_phase
      ) VALUES (${allowedId}, now(), ${usernames.allowed}, 'ready_for_commit')
      RETURNING id
    `
    const archive = archiveFor(allowedId, usernames.allowed, [
      tweet(quoteOuterId, 'allowed quote commentary', {
        entities: {
          urls: [
            {
              url: 'https://t.co/q',
              expanded_url: `https://x.com/${usernames.blocked}/status/${blockedTargetId}`,
              display_url: 'x.com/blocked/status',
            },
          ],
          user_mentions: [],
          media: [],
        },
      }),
      tweet(retweetOuterId, `RT @${usernames.blocked}: blocked child text`, {
        retweeted_status_id_str: blockedTargetId,
      }),
    ])

    await new ArchiveUploadProcessor(sql, upload.id).processArchive(archive)

    const [quoteOuter] =
      await sql`SELECT full_text FROM public.tweets WHERE tweet_id = ${quoteOuterId}`
    const [retweetOuter] =
      await sql`SELECT full_text FROM public.tweets WHERE tweet_id = ${retweetOuterId}`
    const [target] =
      await sql`SELECT full_text, is_tombstone FROM public.tweets WHERE tweet_id = ${blockedTargetId}`
    const [quoteRelation] =
      await sql`SELECT quoted_tweet_id FROM public.quote_tweets WHERE tweet_id = ${quoteOuterId}`
    const [retweetRelation] =
      await sql`SELECT retweeted_tweet_id FROM public.retweets WHERE tweet_id = ${retweetOuterId}`

    expect(quoteOuter.full_text).toBe('allowed quote commentary')
    expect(retweetOuter.full_text).toBe('')
    expect(target).toMatchObject({ full_text: '', is_tombstone: true })
    expect(quoteRelation.quoted_tweet_id).toBe(blockedTargetId)
    expect(retweetRelation.retweeted_tweet_id).toBe(blockedTargetId)
  })

  it('tombstones a blocked outer record without deleting an allowed child', async () => {
    await sql`
      INSERT INTO public.all_account (
        account_id, created_via, username, created_at, account_display_name
      ) VALUES
        (${allowedChildId}, 'test', ${usernames.allowedChild}, now(), 'Allowed child'),
        (${blockedOuterId}, 'test', ${usernames.blockedOuter}, now(), 'Blocked outer')
    `
    await sql`
      INSERT INTO public.tweets (
        tweet_id, account_id, created_at, full_text, favorite_count, retweet_count
      ) VALUES (${allowedChildTweetId}, ${allowedChildId}, now(), 'allowed child text', 0, 0)
    `
    const [upload] = await sql`
      INSERT INTO public.archive_upload (
        account_id, archive_at, username, upload_phase
      ) VALUES (${blockedOuterId}, now(), ${usernames.blockedOuter}, 'ready_for_commit')
      RETURNING id
    `
    await sql`
      INSERT INTO tes.blocked_scraping_users (account_id, block_source)
      VALUES (${blockedOuterId}, 'admin')
    `
    const archive = archiveFor(blockedOuterId, usernames.blockedOuter, [
      tweet(blockedOuterTweetId, 'blocked outer text', {
        entities: {
          urls: [
            {
              url: 'https://t.co/q',
              expanded_url: `https://x.com/${usernames.allowedChild}/status/${allowedChildTweetId}`,
              display_url: 'x.com/allowed/status',
            },
          ],
          user_mentions: [],
          media: [],
        },
      }),
    ])

    await new ArchiveUploadProcessor(sql, upload.id).processArchive(archive)

    const [outer] =
      await sql`SELECT full_text, is_tombstone FROM public.tweets WHERE tweet_id = ${blockedOuterTweetId}`
    const [child] =
      await sql`SELECT full_text, is_tombstone FROM public.tweets WHERE tweet_id = ${allowedChildTweetId}`
    const relations =
      await sql`SELECT 1 FROM public.quote_tweets WHERE tweet_id = ${blockedOuterTweetId}`

    expect(outer).toMatchObject({ full_text: '', is_tombstone: true })
    expect(child).toMatchObject({
      full_text: 'allowed child text',
      is_tombstone: false,
    })
    expect(relations).toHaveLength(0)
  })
})
