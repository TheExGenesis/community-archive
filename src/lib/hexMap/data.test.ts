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
import { getStrands } from '@/lib/community-apps/data'
import { readMembers } from '@/lib/directoryMembers'
import { getStrandTweets } from '@/lib/community-apps/strand-tweets'
import type { PortalTweet } from '@/lib/portal/types'
jest.mock('@/lib/community-apps/data', () => ({ getStrands: jest.fn() }))
jest.mock('@/lib/directoryMembers', () => ({ readMembers: jest.fn() }))
const members = (
  names: string[],
  avatars: [string, string | null][] = [],
): Awaited<ReturnType<typeof readMembers>> => ({
  members: new Set(names),
  avatars: new Map(avatars),
})
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
it('requires current membership for top-level posts and serves stored quote context as-is', async () => {
  jest.mocked(readMembers).mockResolvedValue(members(['alice']))
  const alice = {
    ...tweet('Alice'),
    quotedTweet: { ...tweet('outsider'), media: [] },
  }
  const result = await memberTweets([alice, tweet('outsider')])
  expect(result).toEqual([alice])
  // Opt-outs are enforced at ingestion; serving adds no per-request recheck.
  expect(readMembers).toHaveBeenCalledWith(['Alice', 'outsider'])
})
it('fails closed when membership is unavailable', async () => {
  jest.mocked(readMembers).mockRejectedValue(new Error('unavailable'))
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
  jest
    .mocked(readMembers)
    .mockResolvedValue(
      members(['alice'], [['alice', 'https://test/alice.jpg']]),
    )
  const page = await storyPage('strand', 0)
  expect(page.stories[0].people).toEqual([
    { username: 'alice', avatar: 'https://test/alice.jpg' },
  ])
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

it('keeps the focal banger first across map regions and filters nonmember posts', async () => {
  const firstCell = snapshot.cells.findIndex(
    (c) => c.region > snapshot.cells[0].region,
  )
  jest.mocked(getPublishedDigest).mockResolvedValue({
    content: {
      stories: [
        {
          slug: 'story',
          bangers: [tweet('jack')],
          commentary: [tweet('reply'), tweet('outsider'), tweet('jack')],
        },
      ],
    },
  } as unknown as NonNullable<Awaited<ReturnType<typeof getPublishedDigest>>>)
  jest.mocked(readMembers).mockResolvedValue(members(['jack', 'reply']))
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
      new Map(['jack', 'reply', 'outsider'].map((name) => [name, tweet(name)])),
    )
  const result = await locatedDetail('digest', '2026-10-21/story')
  expect(result?.tweets.map(({ tweet }) => tweet.username)).toEqual([
    'jack',
    'reply',
  ])
  expect(result?.tweets[0].cell).toBe(firstCell)
})

it('overlaps Digest locations with the membership read and never exposes nonmember participants or cells', async () => {
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
            bangers: [tweet('alice'), tweet('outsider')],
            commentary: [],
          },
        ],
      },
    },
  ] as unknown as Awaited<ReturnType<typeof getPublishedDigestEditions>>)
  let releaseMembers!: (result: Awaited<ReturnType<typeof readMembers>>) => void
  const membership = new Promise<Awaited<ReturnType<typeof readMembers>>>(
    (resolve) => {
      releaseMembers = resolve
    },
  )
  let locationStarted!: () => void
  const started = new Promise<void>((resolve) => {
    locationStarted = resolve
  })
  jest.mocked(readMembers).mockReturnValue(membership)
  jest.mocked(locate).mockImplementation(async () => {
    locationStarted()
    return {
      version: snapshot.version,
      counts: {},
      people: [
        { account_id: 'alice', username: 'alice', cell: 0 },
        { account_id: 'outsider', username: 'outsider', cell: 1 },
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
  releaseMembers(members(['alice']))
  const page = await pending
  expect(page.editions[0].stories[0].people).toEqual([
    { username: 'alice', avatar: null, cell: 0 },
  ])
  expect(page.editions[0].stories[0].cells).toEqual([0])
  jest
    .mocked(readMembers)
    .mockRejectedValue(new Error('membership unavailable'))
  await expect(storyPage('digest', 0, [0])).rejects.toThrow(
    'membership unavailable',
  )
})
