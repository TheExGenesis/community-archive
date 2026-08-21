import type { PortalTweet } from '@/lib/portal/types'
import {
  fetchPortalDailyInteractions,
  fetchPortalRecentBangers,
} from '@/lib/portal/analytics'
import { loadDigestCandidates } from './candidates'

const tweet = (id: string, quoteCount = 3): PortalTweet => ({
  id,
  accountId: `9${id}`,
  username: `user_${id}`,
  name: `User ${id}`,
  avatar: null,
  text: `Post ${id}`,
  observedAt: '2026-08-21T05:00:00.000Z',
  createdAt: '2026-08-21T04:00:00.000Z',
  likes: 10,
  rts: 1,
  quoteCount,
  media: [],
})

describe('daily digest candidate snapshot', () => {
  test('keeps all-author bangers and marks the community-authored subset', async () => {
    const allBangers = Array.from({ length: 10 }, (_, index) =>
      tweet(String(index + 1)),
    )
    const fetchRecentBangers = jest.fn<
      ReturnType<typeof fetchPortalRecentBangers>,
      Parameters<typeof fetchPortalRecentBangers>
    >(async (...args) => {
      const targetCommunityUsersOnly = args[4] ?? false
      return targetCommunityUsersOnly
        ? [allBangers[1], allBangers[7]]
        : allBangers
    })
    const fetchDailyInteractions = jest.fn<
      ReturnType<typeof fetchPortalDailyInteractions>,
      Parameters<typeof fetchPortalDailyInteractions>
    >(async () => [])

    const snapshot = await loadDigestCandidates(
      '2026-08-21T06:00:00.000Z',
      false,
      { fetchRecentBangers, fetchDailyInteractions },
    )

    expect(snapshot.candidates).toHaveLength(10)
    expect(
      snapshot.candidates
        .filter(({ communityAuthored }) => communityAuthored)
        .map(({ tweet: candidateTweet }) => candidateTweet.id),
    ).toEqual(['2', '8'])
    expect(snapshot.communityAuthoredCount).toBe(2)
    expect(fetchRecentBangers).toHaveBeenNthCalledWith(
      1,
      50,
      24,
      undefined,
      '2026-08-21T06:00:00.000Z',
      false,
    )
    expect(fetchRecentBangers).toHaveBeenNthCalledWith(
      2,
      50,
      24,
      undefined,
      '2026-08-21T06:00:00.000Z',
      true,
    )
    expect(fetchDailyInteractions).not.toHaveBeenCalled()
  })

  test('marks every candidate in a community-only manual snapshot', async () => {
    const communityBangers = Array.from({ length: 10 }, (_, index) =>
      tweet(String(index + 1)),
    )
    const fetchRecentBangers = jest.fn<
      ReturnType<typeof fetchPortalRecentBangers>,
      Parameters<typeof fetchPortalRecentBangers>
    >(async () => communityBangers)
    const fetchDailyInteractions = jest.fn<
      ReturnType<typeof fetchPortalDailyInteractions>,
      Parameters<typeof fetchPortalDailyInteractions>
    >(async () => [])

    const snapshot = await loadDigestCandidates(
      '2026-08-21T06:00:00.000Z',
      true,
      { fetchRecentBangers, fetchDailyInteractions },
    )

    expect(
      snapshot.candidates.every(({ communityAuthored }) => communityAuthored),
    ).toBe(true)
    expect(fetchRecentBangers).toHaveBeenCalledTimes(1)
  })
})
