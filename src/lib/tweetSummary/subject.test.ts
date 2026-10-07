import { buildConversationTree, type ThreadTweet } from '@/lib/conversationTree'
import type { TweetData } from '@/lib/tweets/types'
import { buildTweetPageSubject, fallbackTitle, plainTweetText } from './subject'

let clock = 0
const tweet = (
  id: string,
  author: string,
  replyTo: string | null = null,
  text = `tweet ${id}`,
): ThreadTweet => ({
  tweet_id: id,
  account_id: `acct-${author}`,
  username: author,
  account_display_name: author.toUpperCase(),
  created_at: new Date(Date.UTC(2026, 0, 1, 0, clock++)).toISOString(),
  full_text: text,
  retweet_count: 0,
  favorite_count: 0,
  reply_to_tweet_id: replyTo,
  reply_to_user_id: null,
  reply_to_username: null,
})

const asTweetData = (t: ThreadTweet): TweetData =>
  ({
    ...t,
    quote_tweet_id: null,
    retweeted_tweet_id: null,
    avatar_media_url: null,
    media: [],
    urls: [],
  }) as TweetData

describe('buildTweetPageSubject', () => {
  it('treats a standalone tweet with only other people replying as a tweet', () => {
    const root = tweet('1', 'alice')
    const tree = buildConversationTree([
      root,
      tweet('2', 'bob', '1'),
      tweet('3', 'cara', '1'),
    ])
    const subject = buildTweetPageSubject(asTweetData(root), tree)
    expect(subject.kind).toBe('tweet')
    expect(subject.chain.map((t) => t.tweet_id)).toEqual(['1'])
    expect(subject.context.map((t) => t.tweet_id).sort()).toEqual(['2', '3'])
    expect(fallbackTitle(subject)).toBe('Tweet by ALICE')
  })

  it('shares one key across every permalink in a self-thread', () => {
    const tweets = [
      tweet('1', 'alice'),
      tweet('2', 'alice', '1'),
      tweet('3', 'alice', '2'),
      tweet('4', 'bob', '2'),
    ]
    const tree = buildConversationTree(tweets)
    const fromRoot = buildTweetPageSubject(asTweetData(tweets[0]!), tree)
    const fromMiddle = buildTweetPageSubject(asTweetData(tweets[1]!), tree)
    expect(fromRoot.kind).toBe('thread')
    expect(fromRoot.chain.map((t) => t.tweet_id)).toEqual(['1', '2', '3'])
    expect(fromMiddle.key).toBe(fromRoot.key)
    expect(fallbackTitle(fromRoot)).toBe('Thread by ALICE')
  })

  it('treats a reply as part of a thread started by the root author', () => {
    const tweets = [tweet('1', 'alice'), tweet('2', 'bob', '1', 'lol')]
    const tree = buildConversationTree(tweets)
    const subject = buildTweetPageSubject(asTweetData(tweets[1]!), tree)
    expect(subject.kind).toBe('thread')
    expect(subject.chain.map((t) => t.tweet_id)).toEqual(['1', '2'])
    expect(subject.author.username).toBe('alice')
  })

  it('stops the chain at a deleted parent', () => {
    // '0' is missing, so the tree synthesizes a placeholder root for it.
    const tweets = [tweet('1', 'alice', '0'), tweet('2', 'alice', '1')]
    const tree = buildConversationTree(tweets)
    const subject = buildTweetPageSubject(asTweetData(tweets[1]!), tree)
    expect(subject.chain.map((t) => t.tweet_id)).toEqual(['1', '2'])
  })

  it('falls back to the tweet alone without a conversation tree', () => {
    const subject = buildTweetPageSubject(asTweetData(tweet('9', 'dana')), null)
    expect(subject.kind).toBe('tweet')
    expect(subject.key).toBe('tweet:9-9:1')
  })

  it('bounds very long chains around the linked tweet', () => {
    const tweets = [tweet('0', 'alice')]
    for (let i = 1; i < 40; i++)
      tweets.push(tweet(String(i), 'alice', String(i - 1)))
    const tree = buildConversationTree(tweets)
    const subject = buildTweetPageSubject(asTweetData(tweets[30]!), tree)
    const ids = subject.chain.map((t) => t.tweet_id)
    expect(ids).toHaveLength(24)
    expect(ids[0]).toBe('0')
    expect(ids).toContain('30')
  })
})

describe('plainTweetText', () => {
  it('drops links and leading reply handles', () => {
    expect(plainTweetText('@a @b  hello there https://t.co/x')).toBe(
      'hello there',
    )
  })
})
