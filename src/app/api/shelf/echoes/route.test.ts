import { NextRequest } from 'next/server'
import { GET } from './route'
import { findShelfRow, getShelfEchoes } from '@/lib/shelf/data'

jest.mock('@/lib/shelf/data', () => ({
  findShelfRow: jest.fn(),
  getShelfEchoes: jest.fn(),
}))
jest.mock('@/lib/shelf/access', () => ({ canCurateShelf: jest.fn() }))

const key = 'c'.repeat(32)
const get = (query: string) =>
  GET(
    new NextRequest(`https://community-archive.org/api/shelf/echoes?${query}`),
  )

beforeEach(() => jest.clearAllMocks())

test('validates input and 404s items the caller cannot see', async () => {
  expect((await get('account_id=42&key=nope')).status).toBe(400)
  jest.mocked(findShelfRow).mockResolvedValueOnce(null)
  expect((await get(`account_id=42&key=${key}`)).status).toBe(404)
  expect(getShelfEchoes).not.toHaveBeenCalled()
})

test('looks echoes up by the work behind the key; private items are not cached', async () => {
  jest.mocked(findShelfRow).mockResolvedValue({
    isPublic: false,
    row: { work_key: 'name:governingthecommons' } as never,
  })
  jest
    .mocked(getShelfEchoes)
    .mockResolvedValueOnce({ people: [], tweets: [], total: 3, failed: false })
    .mockResolvedValueOnce({ people: [], tweets: [], total: 3, failed: true })
  const ok = await get(`account_id=42&key=${key}`)
  expect(ok.status).toBe(200)
  expect(await ok.json()).toEqual({ people: [], tweets: [], total: 3 })
  expect(ok.headers.get('Cache-Control')).toBe('private, no-store')
  expect(getShelfEchoes).toHaveBeenCalledWith('42', 'name:governingthecommons')
  expect((await get(`account_id=42&key=${key}`)).status).toBe(503)
})
