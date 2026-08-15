import { repairProfileTweetText } from './profileTweetText'
import { fetchSyndicatedTweets } from './twitterSyndication'

jest.mock('./twitterSyndication', () => ({
  fetchSyndicatedTweets: jest.fn(),
}))

const mockFetchSyndicatedTweets = fetchSyndicatedTweets as jest.MockedFunction<
  typeof fetchSyndicatedTweets
>

afterEach(() => {
  jest.resetAllMocks()
})

test('uses syndication line breaks for flattened profile text', async () => {
  mockFetchSyndicatedTweets.mockResolvedValue(
    new Map([
      [
        '1636679643120951297',
        {
          tweet_id: '1636679643120951297',
          full_text:
            '*deep breath* \n\nART IS PRE-PARADIGMATIC SCIENCE\n\nand art is relevance realization',
        } as any,
      ],
    ]),
  )

  const tweets = [
    {
      tweet_id: '1636679643120951297',
      full_text:
        '*deep breath* ART IS PRE-PARADIGMATIC SCIENCEand art is relevance realization',
      favorite_count: 143,
    },
  ]

  await expect(repairProfileTweetText(tweets)).resolves.toEqual([
    {
      ...tweets[0],
      full_text:
        '*deep breath* \n\nART IS PRE-PARADIGMATIC SCIENCE\n\nand art is relevance realization',
    },
  ])
})

test('keeps DB text when syndication has no line breaks', async () => {
  mockFetchSyndicatedTweets.mockResolvedValue(
    new Map([
      [
        '1',
        {
          tweet_id: '1',
          full_text: 'same text',
        } as any,
      ],
    ]),
  )

  const tweets = [{ tweet_id: '1', full_text: 'same text' }]
  await expect(repairProfileTweetText(tweets)).resolves.toEqual(tweets)
  expect(mockFetchSyndicatedTweets).not.toHaveBeenCalled()
})
