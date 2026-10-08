import { POST } from './route'
import { canCurateShelf } from '@/lib/shelf/access'
import { setShelfCuration, ShelfCurationError } from '@/lib/shelf/data'

jest.mock('@/lib/shelf/access', () => ({ canCurateShelf: jest.fn() }))
jest.mock('@/lib/shelf/data', () => {
  class ShelfCurationError extends Error {
    constructor(
      readonly kind: string,
      message: string,
    ) {
      super(message)
    }
  }
  return { setShelfCuration: jest.fn(), ShelfCurationError }
})

const url = 'https://community-archive.org/api/shelf/curation'
const post = (body: unknown) =>
  POST(new Request(url, { method: 'POST', body: JSON.stringify(body) }))
const valid = { account_id: '42', work_keys: ['book:dune'], status: 'approved' }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(canCurateShelf).mockResolvedValue(true)
  jest.mocked(setShelfCuration).mockResolvedValue(1)
})

test('approves, hides, resets and renames for the verified owner', async () => {
  const response = await post(valid)
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(canCurateShelf).toHaveBeenCalledWith('42')
  expect(setShelfCuration).toHaveBeenLastCalledWith(
    '42',
    ['book:dune'],
    'approved',
    undefined,
  )
  await post({ ...valid, work_keys: ['a:1', 'a:2', 'a:1'], status: 'hidden' })
  expect(setShelfCuration).toHaveBeenLastCalledWith(
    '42',
    ['a:1', 'a:2'],
    'hidden',
    undefined,
  )
  await post({ ...valid, status: 'pending', title: '  Dune Messiah ' })
  expect(setShelfCuration).toHaveBeenLastCalledWith(
    '42',
    ['book:dune'],
    'pending',
    'Dune Messiah',
  )
})

test('rejects malformed changes before checking ownership or writing', async () => {
  for (const body of [
    null,
    {},
    { ...valid, account_id: 'abc' },
    { ...valid, work_keys: [] },
    { ...valid, work_keys: ['ab'] },
    { ...valid, work_keys: ['x'.repeat(301)] },
    { ...valid, work_keys: Array.from({ length: 501 }, (_, i) => `k:${i}`) },
    { ...valid, work_keys: 'book:dune' },
    { ...valid, status: 'deleted' },
    // 'changed' is a read status only; owners approve, hide or reset.
    { ...valid, status: 'changed' },
    { ...valid, title: 'x'.repeat(201) },
    { ...valid, title: 5 },
    { ...valid, work_keys: ['a:1', 'a:2'], title: 'Two' },
  ])
    expect((await post(body)).status).toBe(400)
  expect(canCurateShelf).not.toHaveBeenCalled()
  expect(setShelfCuration).not.toHaveBeenCalled()
})

test('refuses anyone but the owner', async () => {
  jest.mocked(canCurateShelf).mockResolvedValue(false)
  expect((await post(valid)).status).toBe(403)
  expect(setShelfCuration).not.toHaveBeenCalled()
})

test('maps database refusals and outages', async () => {
  jest
    .mocked(setShelfCuration)
    .mockRejectedValueOnce(new ShelfCurationError('invalid', 'x'))
    .mockRejectedValueOnce(new ShelfCurationError('forbidden', 'x'))
    .mockRejectedValueOnce(new Error('down'))
  expect((await post(valid)).status).toBe(400)
  expect((await post(valid)).status).toBe(403)
  const failed = await post(valid)
  expect(failed.status).toBe(503)
  expect(failed.headers.get('Cache-Control')).toBe('private, no-store')
})
