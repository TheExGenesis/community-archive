import { getPublishedDigest } from './data'
import { createDigestReadClient } from './database'
import { publicDataConfig } from '@/lib/publicDataSource'
import { AUGUST_11_MOCK_DIGEST } from './mock'

const bodies = new Map<string, unknown>()
jest.mock('next/cache', () => ({
  unstable_cache:
    (read: (...args: unknown[]) => Promise<unknown>) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify(args)
      if (!bodies.has(key)) bodies.set(key, await read(...args))
      return bodies.get(key)
    },
}))
jest.mock('./database', () => ({ createDigestReadClient: jest.fn() }))
jest.mock('./mock', () => ({
  ...jest.requireActual('./mock'),
  getPreviewDigestEdition: () => null,
}))
jest.mock('@/lib/publicDataSource', () => ({ publicDataConfig: jest.fn() }))
jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))

let pointers: { id: string; updated_at: string }[]
let pointerError: Error | null
let bodyReads: number
let revision: string
beforeEach(() => {
  bodies.clear()
  revision = '2026-10-24T01:00:00Z'
  pointers = [{ id: 'edition-1', updated_at: revision }]
  pointerError = null
  bodyReads = 0
  jest
    .mocked(publicDataConfig)
    .mockReturnValue({ sourceId: 'production', url: '', key: '' })
  jest.mocked(createDigestReadClient).mockImplementation(
    () =>
      ({
        from: () => {
          const chain: Record<string, unknown> = {
            then: (resolve: (value: unknown) => void) =>
              Promise.resolve({ data: pointers, error: pointerError }).then(
                resolve,
              ),
            maybeSingle: async () => {
              bodyReads++
              return {
                error: null,
                data: {
                  id: 'edition-1',
                  issue_number: 1,
                  digest_date: AUGUST_11_MOCK_DIGEST.digestDate,
                  status: 'published',
                  content: AUGUST_11_MOCK_DIGEST.content,
                  updated_at: revision,
                },
              }
            },
          }
          for (const method of ['select', 'eq', 'order', 'range'])
            chain[method] = () => chain
          return chain
        },
      }) as never,
  )
})

test('shares edition bodies while checking current publication on every request', async () => {
  expect(await getPublishedDigest()).not.toBeNull()
  expect(await getPublishedDigest()).not.toBeNull()
  expect(bodyReads).toBe(1)
  pointers = [] // PostgreSQL withdrew the edition after an explicit opt-out.
  expect(await getPublishedDigest()).toBeNull()
  expect(bodyReads).toBe(1)
})

test('an edit or different data source cannot reuse an older body', async () => {
  await getPublishedDigest()
  revision = '2026-10-24T02:00:00Z'
  pointers[0].updated_at = revision
  expect((await getPublishedDigest())?.updatedAt).toBe(revision)
  jest
    .mocked(publicDataConfig)
    .mockReturnValue({ sourceId: 'staging', url: '', key: '' })
  await getPublishedDigest()
  expect(bodyReads).toBe(3)
})

test('a failed publication check cannot serve a previously cached edition', async () => {
  await getPublishedDigest()
  pointerError = new Error('offline')
  await expect(getPublishedDigest(undefined, { strict: true })).rejects.toThrow(
    'temporarily unavailable',
  )
})
