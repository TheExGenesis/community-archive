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
