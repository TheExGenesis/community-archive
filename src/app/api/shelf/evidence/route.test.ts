import { NextRequest } from 'next/server'
import { GET } from './route'
import { findShelfRow, getShelfEvidence } from '@/lib/shelf/data'

jest.mock('@/lib/shelf/data', () => ({
  findShelfRow: jest.fn(),
  getShelfEvidence: jest.fn(),
}))
jest.mock('@/lib/shelf/access', () => ({ canCurateShelf: jest.fn() }))

const key = 'b'.repeat(32)
const get = (query: string) =>
  GET(
    new NextRequest(
      `https://community-archive.org/api/shelf/evidence?${query}`,
    ),
  )

beforeEach(() => jest.clearAllMocks())

test('validates input and 404s items the caller cannot see', async () => {
  expect((await get('account_id=42&key=nope')).status).toBe(400)
  jest.mocked(findShelfRow).mockResolvedValueOnce(null)
  expect((await get(`account_id=42&key=${key}`)).status).toBe(404)
  expect(getShelfEvidence).not.toHaveBeenCalled()
})

test('returns hydrated tweets, and a non-cacheable 503 on total failure', async () => {
  jest.mocked(findShelfRow).mockResolvedValue({
    isPublic: true,
    row: { evidence_tweet_ids: ['1', '2'] } as never,
  })
  jest
    .mocked(getShelfEvidence)
    .mockResolvedValueOnce({ tweets: [], total: 2, failed: false })
    .mockResolvedValueOnce({ tweets: [], total: 2, failed: true })
  const ok = await get(`account_id=42&key=${key}`)
  expect(ok.status).toBe(200)
  expect(getShelfEvidence).toHaveBeenCalledWith('42', ['1', '2'])
  const down = await get(`account_id=42&key=${key}`)
  expect(down.status).toBe(503)
  expect(down.headers.get('Cache-Control')).toBe('private, no-store')
})
