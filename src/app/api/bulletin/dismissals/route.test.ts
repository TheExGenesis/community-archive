import { DELETE, POST } from './route'
import { setBulletinDismissal } from '@/lib/bulletin/data'

jest.mock('@/lib/bulletin/data', () => ({ setBulletinDismissal: jest.fn() }))
const url = 'https://community-archive.org/api/bulletin/dismissals'
const post = (body: unknown) =>
  POST(new Request(url, { method: 'POST', body: JSON.stringify(body) }))
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(setBulletinDismissal).mockResolvedValue(true)
})

test('hides one notice and restores one or all', async () => {
  expect((await post({ tweet_id: '123' })).status).toBe(200)
  expect(setBulletinDismissal).toHaveBeenLastCalledWith('123', true)
  await DELETE(new Request(`${url}?tweet_id=123`, { method: 'DELETE' }))
  expect(setBulletinDismissal).toHaveBeenLastCalledWith('123', false)
  await DELETE(new Request(url, { method: 'DELETE' }))
  expect(setBulletinDismissal).toHaveBeenLastCalledWith(null, false)
})

test('rejects anything that is not a tweet id before writing', async () => {
  for (const body of [{}, { tweet_id: 'x' }, { tweet_id: 5 }, null])
    expect((await post(body)).status).toBe(400)
  expect(
    (await DELETE(new Request(`${url}?tweet_id=1;drop`, { method: 'DELETE' })))
      .status,
  ).toBe(400)
  expect(setBulletinDismissal).not.toHaveBeenCalled()
})

test('reports the read-only preview and failed writes', async () => {
  jest.mocked(setBulletinDismissal).mockResolvedValue(false)
  expect((await post({ tweet_id: '1' })).status).toBe(403)
  jest.mocked(setBulletinDismissal).mockRejectedValue(new Error('down'))
  expect((await post({ tweet_id: '1' })).status).toBe(503)
})
