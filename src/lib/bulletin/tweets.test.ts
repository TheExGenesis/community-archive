import { createHash } from 'crypto'
import { hydrateBulletinTweets, loadBulletinTweets } from './tweets'
import { loadBulletinBoardState } from './data'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { fetchClickHouseTweetThreadPageData } from '@/lib/clickhouseTweetPage'
import type { ClickHouseTweetThreadPageData } from '@/lib/clickhouseTweetPage'
jest.mock('./data', () => ({ loadBulletinBoardState: jest.fn() }))
jest.mock('@/lib/clickhouseGateway', () => ({
  fetchAnalyticsGatewayJson: jest.fn(),
}))
jest.mock('@/lib/clickhouseTweetPage', () => ({
  fetchClickHouseTweetThreadPageData: jest.fn(),
}))
const hash = createHash('sha256').update('Original').digest('hex')
const record = { tweet_id: '123', account_id: '42', content_hash: hash }
const source = {
  ...record,
  full_text: 'Original',
  reply_to_tweet_id: null,
  retweet: false,
}
const detail = {
  tweet_id: '123',
  account_id: '42',
  username: 'member',
  account_display_name: 'Member',
  full_text: 'Original',
  created_at: '2026-09-11T00:00:00Z',
  media: [{ media_url: 'https://example.com/photo.png', media_type: 'photo' }],
  quoted_tweet: {
    tweet_id: '456',
    full_text: 'Quoted context',
    media: [
      { media_url: 'https://example.com/quote.png', media_type: 'photo' },
    ],
  },
}
beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({ data: [source] })
  jest.mocked(fetchClickHouseTweetThreadPageData).mockResolvedValue({
    tweet: detail,
    threadTree: null,
  } as unknown as ClickHouseTweetThreadPageData)
})
test('full-fidelity admin hydration preserves media and quoted context', async () => {
  const result = await hydrateBulletinTweets(['123'], { notices: [record] })
  expect(result.tweets[0]).toMatchObject({
    text: 'Original',
    media: [{ url: 'https://example.com/photo.png' }],
    quotedTweet: {
      text: 'Quoted context',
      media: [{ url: 'https://example.com/quote.png' }],
    },
  })
})
test('full details cannot expose another account or an edited source', async () => {
  for (const change of [{ account_id: '99' }, { full_text: 'Edited' }]) {
    jest.mocked(fetchClickHouseTweetThreadPageData).mockResolvedValue({
      tweet: { ...detail, ...change },
      threadTree: null,
    } as unknown as ClickHouseTweetThreadPageData)
    expect(
      (await hydrateBulletinTweets(['123'], { notices: [record] })).tweets,
    ).toEqual([])
  }
})
test('missing source is not resurrected by available thread details', async () => {
  jest.mocked(fetchAnalyticsGatewayJson).mockResolvedValue({ data: [] })
  expect(
    (await hydrateBulletinTweets(['123'], { notices: [record] })).tweets,
  ).toEqual([])
})
test('the public reader still requires board authorization before source queries', async () => {
  jest
    .mocked(loadBulletinBoardState)
    .mockRejectedValue(new Error('login required'))
  await expect(loadBulletinTweets(['123'])).rejects.toThrow('login required')
  expect(fetchAnalyticsGatewayJson).not.toHaveBeenCalled()
  expect(fetchClickHouseTweetThreadPageData).not.toHaveBeenCalled()
})
