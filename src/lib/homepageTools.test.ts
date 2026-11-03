jest.mock('server-only', () => ({}))
jest.mock('next/headers', () => ({ headers: jest.fn() }))
jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/lib/auth-utils', () => ({ getOptInStatus: jest.fn() }))
jest.mock('@/lib/portal/data', () => ({
  getInitialPortalBangersPage: jest.fn(),
}))
jest.mock('@/lib/bulletin/page', () => ({ loadBulletinPage: jest.fn() }))

import { getCurrentUser } from '@/lib/portal/auth'
import { getOptInStatus } from '@/lib/auth-utils'
import { loadBulletinPage } from '@/lib/bulletin/page'
import { loadHomepageBulletin, pickHomepageTubeVideos } from './homepageTools'
import type { TubeVideo } from '@/lib/tube'

const video = (id: string, n: number, daysAgo: number): TubeVideo => ({
  id,
  title: id,
  channel: 'c',
  n,
  likes: 0,
  first: 0,
  last: 1_000_000_000 - daysAgo * 86400,
  nb: [],
})

describe('homepage tools', () => {
  it('picks the most-shared videos with a share in the last month', () => {
    const picks = pickHomepageTubeVideos({
      generated: 1_000_000_000,
      shards: 1,
      videos: [
        video('old-giant', 99, 45),
        video('a', 5, 1),
        video('b', 30, 10),
        video('c', 12, 29),
        video('d', 2, 3),
      ],
    })
    expect(picks.map((v) => v.id)).toEqual(['b', 'c', 'a'])
  })

  it('never loads the bulletin for guests or members without consent', async () => {
    jest.mocked(getCurrentUser).mockResolvedValueOnce(null)
    await expect(loadHomepageBulletin()).resolves.toBeNull()

    jest
      .mocked(getCurrentUser)
      .mockResolvedValueOnce({ id: 'u1', is_anonymous: false } as never)
    jest.mocked(getOptInStatus).mockResolvedValueOnce({
      data: { opted_in: true, explicit_optout: true },
      error: null,
    } as never)
    await expect(loadHomepageBulletin()).resolves.toBeNull()
    expect(loadBulletinPage).not.toHaveBeenCalled()
  })
})
