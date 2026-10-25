import {
  getAppPolicy,
  hasBlockedParticipant,
  getBirdseyeAnalysis,
} from './data'
import { createServerServiceRoleClient } from '@/utils/supabase'
jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/publicDataSource', () => ({
  usesProductionReadSource: () => false,
  publicDataConfig: () => ({ sourceId: 'test-source' }),
}))
const makeClient = jest.mocked(createServerServiceRoleClient)

function stubDatabase({
  optedOut = ['withdrawn'],
  members = ['member', 'withdrawn'],
  fail = false,
} = {}) {
  const consent = {
    data: optedOut.map((username) => ({ username })),
    error: fail ? new Error('offline') : null,
  }
  const from = jest.fn(() => {
    const chain: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) =>
        Promise.resolve(consent).then(resolve),
    }
    for (const method of ['select', 'eq', 'order', 'range'])
      chain[method] = jest.fn(() => chain)
    return chain
  })
  const rpc = jest.fn(async () => ({
    data: members.map((username) => ({
      account_id: `${username}-id`,
      username,
      has_archive: true,
      avatar_media_url: `https://test/${username}.jpg`,
    })),
    error: null,
  }))
  makeClient.mockReturnValue({ from, rpc } as never)
  return { from, rpc }
}
afterEach(() => jest.clearAllMocks())
test('explicit withdrawal overrides archived membership with case-insensitive matching', async () => {
  const { rpc } = stubDatabase({ optedOut: ['WiThDrAwN'] })
  const policy = await getAppPolicy(['member', 'withdrawn', 'Member'])
  expect(Array.from(policy.members)).toEqual(['member'])
  // One indexed directory read for every distinct handle.
  expect(rpc).toHaveBeenCalledTimes(1)
  expect(rpc).toHaveBeenCalledWith(
    'directory_members_by_username',
    { p_usernames: ['member', 'withdrawn'] },
    { get: true },
  )
  expect(hasBlockedParticipant(['WITHDRAWN', 'member'], policy.blocked)).toBe(
    true,
  )
  expect(hasBlockedParticipant(['member'], policy.blocked)).toBe(false)
})
test('policy lookup failure fails closed instead of serving the saved snapshot', async () => {
  const { from } = stubDatabase({ fail: true })
  await expect(getAppPolicy(['member'])).rejects.toThrow('consent check failed')
  expect(from).toHaveBeenCalledTimes(1)
})
test('rejects path traversal before accessing display storage', async () => {
  await expect(
    getBirdseyeAnalysis('../member', { prefix: 'v1/test' } as never, new Set()),
  ).rejects.toThrow('Invalid Birdseye username')
  expect(makeClient).not.toHaveBeenCalled()
})

test('withholds topics flagged by the original analysis or naming a withdrawn participant', async () => {
  const clusters = [
    { id: 'good', participants: ['member'] },
    { id: 'low-quality', participants: ['member'] },
    { id: 'withdrawn', participants: ['other'] },
  ]
  makeClient.mockReturnValue({
    storage: {
      from: () => ({
        download: async () => ({
          data: {
            text: async () =>
              JSON.stringify({ username: 'member', groups: [], clusters }),
          },
          error: null,
        }),
      }),
    },
  } as never)
  const analysis = await getBirdseyeAnalysis(
    'member',
    {
      prefix: 'v1/test',
      birdseye: [{ username: 'member', hiddenClusterIds: ['low-quality'] }],
    } as never,
    new Set(['other']),
  )
  expect(analysis.clusters).toEqual([clusters[0]])
})

test('overlaps membership with consent but waits for consent before accepting renamed accounts', async () => {
  let resolveConsent: (value: unknown) => void = () => {}
  const consent = new Promise((resolve) => {
    resolveConsent = resolve
  })
  let membershipStarted = false
  makeClient.mockReturnValue({
    from: () => {
      const chain: Record<string, unknown> = {
        then: (resolve: (value: unknown) => void) => consent.then(resolve),
      }
      for (const method of ['select', 'eq', 'order', 'range'])
        chain[method] = () => chain
      return chain
    },
    rpc: async () => {
      membershipStarted = true
      return {
        data: [
          {
            username: 'renamed',
            account_id: 'blocked-id',
            has_archive: true,
            avatar_media_url: null,
          },
        ],
        error: null,
      }
    },
  } as never)
  let completed = false
  const pending = getAppPolicy(['renamed']).then((result) => {
    completed = true
    return result
  })
  await Promise.resolve()
  await Promise.resolve()
  expect(membershipStarted).toBe(true)
  expect(completed).toBe(false)
  resolveConsent({
    data: [{ username: 'previous', twitter_user_id: 'blocked-id' }],
    error: null,
  })
  const policy = await pending
  expect(Array.from(policy.members)).toEqual([])
})
