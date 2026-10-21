import { locate } from './gateway'
import snapshot from './snapshot.json'
jest.mock('./gateway', () => ({
  locate: jest.fn().mockRejectedValue(new Error('Unavailable')),
}))
import { memberTweets, storyPage } from './data'
import { getAppPolicy, getStrands } from '@/lib/community-apps/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getStrandTweets } from '@/lib/community-apps/strand-tweets'
import type { PortalTweet } from '@/lib/portal/types'
jest.mock('@/lib/community-apps/data', () => ({
  getAppPolicy: jest.fn(),
  getStrands: jest.fn(),
}))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/digest/database', () => ({}))
jest.mock('@/lib/digest/data', () => ({}))
jest.mock('@/lib/digest/mock', () => ({}))
jest.mock('@/lib/community-apps/strand-list', () => ({
  filterStrands: (strands: unknown[]) => strands,
}))
jest.mock('@/lib/community-apps/strand-tweets', () => ({
  getStrandTweets: jest.fn(),
}))
const tweet = (username: string, accountId = username): PortalTweet => ({
  id: accountId,
  username,
  accountId,
  name: username,
  avatar: null,
  text: 'Example',
  observedAt: '',
  createdAt: '',
  likes: 0,
  rts: 0,
})
it('requires membership, blocks by ID or handle, and removes nonmember quoted content', async () => {
  jest.mocked(getAppPolicy).mockResolvedValue({
    members: new Set(['alice', 'blocked', 'renamed']),
    blocked: new Set(['blocked']),
    blockedIds: new Set(['old-id']),
  })
  const alice = {
    ...tweet('Alice'),
    quotedTweet: { ...tweet('outsider'), media: [] },
  }
  const result = await memberTweets([
    alice,
    tweet('outsider'),
    tweet('blocked'),
    tweet('renamed', 'old-id'),
  ])
  expect(result).toEqual([{ ...alice, quotedTweet: undefined }])
})
it('fails closed when current consent is unavailable', async () => {
  jest.mocked(getAppPolicy).mockRejectedValue(new Error('unavailable'))
  await expect(memberTweets([tweet('alice')])).rejects.toThrow('unavailable')
})

it('loads strand cards without hydrating tweet threads and omits nonmember participants', async () => {
  jest.mocked(getStrands).mockResolvedValue({
    generatedAt: '2026-10-20',
    strands: [
      {
        id: '123',
        username: 'alice',
        participants: ['outsider'],
        essentialTweets: [],
        title: 'An idea',
        summary: 'Summary',
        createdAt: '2026-10-20',
        rating: 1,
        totalPosts: 1,
        mapLabel: 'An idea',
        activity: undefined,
        position: undefined,
        text: '',
      },
    ],
  } as Awaited<ReturnType<typeof getStrands>>)
  jest.mocked(getAppPolicy).mockResolvedValue({
    members: new Set(['alice']),
    blocked: new Set(),
    blockedIds: new Set(),
  })
  const select = jest.fn(() => ({
    or: jest.fn().mockResolvedValue({
      data: [{ username: 'alice', avatar_media_url: null }],
      error: null,
    }),
  }))
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ from: () => ({ select }) } as unknown as ReturnType<
      typeof createServerServiceRoleClient
    >)
  const page = await storyPage('strand', 0)
  expect(page.stories[0].people).toEqual([{ username: 'alice', avatar: null }])
  expect(getStrandTweets).not.toHaveBeenCalled()
  jest
    .mocked(locate)
    .mockResolvedValue({
      version: snapshot.version,
      counts: { 0: 1 },
      people: [{ account_id: '1', username: 'alice', cell: 0 }],
    })
  const exact = await storyPage('strand', 0, [0])
  expect(exact.stories[0].cells).toEqual([0])
  expect(exact.countryFallback).toBe(false)
  const nearby = snapshot.cells.findIndex(
    (c, i) => i !== 0 && c.region === snapshot.cells[0].region,
  )
  const fallback = await storyPage('strand', 0, [nearby])
  expect(fallback.countryFallback).toBe(true)
  expect(fallback.stories).toHaveLength(1)
  jest.mocked(locate).mockRejectedValue(new Error('Offline'))
  await expect(storyPage('strand', 0, [0])).rejects.toThrow(
    'Story locations unavailable',
  )
})
