import { locate } from './gateway'
import snapshot from './snapshot.json'
jest.mock('./gateway', () => ({
  locate: jest.fn().mockRejectedValue(new Error('Unavailable')),
}))
import { memberTweets, storyPage, locatedDetail } from './data'
import {
  getPublishedDigest,
  getPublishedDigestEditions,
} from '@/lib/digest/data'
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
jest.mock('@/lib/digest/data', () => ({
  getPublishedDigest: jest.fn(),
  getPublishedDigestEditions: jest.fn(),
}))
jest.mock('@/lib/digest/mock', () => ({ getPreviewDigestEdition: () => null }))
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
it('requires membership, blocks by ID or handle, and preserves public quote context while blocking opt-outs', async () => {
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
  expect(result).toEqual([alice])
  expect(
    (
      await memberTweets([
        { ...alice, quotedTweet: { ...tweet('renamed', 'old-id'), media: [] } },
      ])
    )[0].quotedTweet,
  ).toBeUndefined()
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
  jest.mocked(locate).mockResolvedValue({
    version: snapshot.version,
    counts: { 0: 1 },
    people: [{ account_id: '1', username: 'alice', cell: 0 }],
  })
  const exact = await storyPage('strand', 0, [0])
  expect(exact.stories[0].cells).toEqual([0])
  expect(exact.stories[0].people[0]).toMatchObject({
    username: 'alice',
    cell: 0,
  })
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

it('keeps the focal banger first across map regions and filters opted-out posts', async () => {
  const firstCell = snapshot.cells.findIndex(
    (c) => c.region > snapshot.cells[0].region,
  )
  jest.mocked(getPublishedDigest).mockResolvedValue({
    content: {
      stories: [
        {
          slug: 'story',
          bangers: [tweet('jack')],
          commentary: [tweet('reply'), tweet('blocked'), tweet('jack')],
        },
      ],
    },
  } as unknown as NonNullable<Awaited<ReturnType<typeof getPublishedDigest>>>)
  jest.mocked(getAppPolicy).mockResolvedValue({
    members: new Set(['jack', 'reply', 'blocked']),
    blocked: new Set(['blocked']),
    blockedIds: new Set(),
  })
  jest.mocked(locate).mockResolvedValue({
    version: snapshot.version,
    counts: {},
    people: [
      { account_id: 'jack', username: 'jack', cell: firstCell },
      { account_id: 'reply', username: 'reply', cell: 0 },
    ],
  })
  jest
    .mocked(getStrandTweets)
    .mockResolvedValue(
      new Map(['jack', 'reply', 'blocked'].map((name) => [name, tweet(name)])),
    )
  const result = await locatedDetail('digest', '2026-10-21/story')
  expect(result?.tweets.map(({ tweet }) => tweet.username)).toEqual([
    'jack',
    'reply',
  ])
  expect(result?.tweets[0].cell).toBe(firstCell)
})

it('overlaps Digest locations with fresh policy and never exposes unchecked participants or cells', async () => {
  jest.mocked(getPublishedDigestEditions).mockResolvedValue([
    {
      digestDate: '2026-10-24',
      content: {
        executiveSummary: ['A day'],
        stories: [
          {
            slug: 'story',
            title: 'A story',
            subtitle: 'Summary',
            bangers: [tweet('alice'), tweet('blocked')],
            commentary: [],
          },
        ],
      },
    },
  ] as unknown as Awaited<ReturnType<typeof getPublishedDigestEditions>>)
  let releasePolicy!: (policy: Awaited<ReturnType<typeof getAppPolicy>>) => void
  const policy = new Promise<Awaited<ReturnType<typeof getAppPolicy>>>(
    (resolve) => {
      releasePolicy = resolve
    },
  )
  let locationStarted!: () => void
  const started = new Promise<void>((resolve) => {
    locationStarted = resolve
  })
  jest.mocked(getAppPolicy).mockReturnValue(policy)
  jest.mocked(locate).mockImplementation(async () => {
    locationStarted()
    return {
      version: snapshot.version,
      counts: {},
      people: [
        { account_id: 'alice', username: 'alice', cell: 0 },
        { account_id: 'blocked', username: 'blocked', cell: 1 },
      ],
    }
  })
  let settled = false
  const pending = storyPage('digest', 0, [0]).then((page) => {
    settled = true
    return page
  })
  await started
  expect(settled).toBe(false)
  releasePolicy({
    members: new Set(['alice', 'blocked']),
    blocked: new Set(),
    blockedIds: new Set(['blocked']),
  })
  const page = await pending
  expect(page.editions[0].stories[0].people).toEqual([
    { username: 'alice', avatar: null, cell: 0 },
  ])
  expect(page.editions[0].stories[0].cells).toEqual([0])
  jest.mocked(getAppPolicy).mockRejectedValue(new Error('consent unavailable'))
  await expect(storyPage('digest', 0, [0])).rejects.toThrow(
    'consent unavailable',
  )
})
