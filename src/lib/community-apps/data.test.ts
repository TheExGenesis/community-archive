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
  const from = jest.fn((table: string) => {
    const response =
      table === 'optin'
        ? {
            data: optedOut.map((username) => ({ username })),
            error: fail ? new Error('offline') : null,
          }
        : {
            data: members.map((username) => ({
              username,
              has_archive: true,
              is_opted_in: false,
            })),
            error: null,
          }
    const chain: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) =>
        Promise.resolve(response).then(resolve),
    }
    for (const method of ['select', 'eq', 'order', 'range', 'or'])
      chain[method] = jest.fn(() => chain)
    return chain
  })
  makeClient.mockReturnValue({ from } as never)
  return from
}
afterEach(() => jest.clearAllMocks())
test('explicit withdrawal overrides archived membership with case-insensitive matching', async () => {
  stubDatabase({ optedOut: ['WiThDrAwN'] })
  const policy = await getAppPolicy(['member', 'withdrawn'])
  expect(Array.from(policy.members)).toEqual(['member'])
  expect(hasBlockedParticipant(['WITHDRAWN', 'member'], policy.blocked)).toBe(
    true,
  )
  expect(hasBlockedParticipant(['member'], policy.blocked)).toBe(false)
})
test('policy lookup failure fails closed instead of serving the saved snapshot', async () => {
  const from = stubDatabase({ fail: true })
  await expect(getAppPolicy(['member'])).rejects.toThrow('consent check failed')
  expect(from).toHaveBeenCalledTimes(2)
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
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        then: (resolve: (value: unknown) => void) => {
          if (table === 'optin') return consent.then(resolve)
          membershipStarted = true
          return Promise.resolve({
            data: [
              {
                username: 'renamed',
                account_id: 'blocked-id',
                has_archive: true,
              },
            ],
            error: null,
          }).then(resolve)
        },
      }
      for (const method of ['select', 'eq', 'order', 'range', 'or'])
        chain[method] = () => chain
      return chain
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
