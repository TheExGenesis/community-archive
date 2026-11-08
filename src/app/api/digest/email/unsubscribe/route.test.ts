import { GET, POST } from './route'
import { unsubscribe } from '@/lib/digest/emailSubscriptions'

jest.mock('@/lib/digest/emailSubscriptions', () => ({
  unsubscribe: jest.fn(),
}))

beforeEach(() => jest.mocked(unsubscribe).mockResolvedValue(true))

test('daily links still end the whole subscription and land on the daily page', async () => {
  const response = await GET(
    new Request('https://example.org/api/digest/email/unsubscribe?token=t'),
  )
  expect(unsubscribe).toHaveBeenCalledWith('t', undefined)
  expect(response.headers.get('location')).toBe(
    'https://example.org/digest?email=unsubscribed',
  )
})

test('weekly links turn off only the weekly list, including one-click POSTs', async () => {
  const response = await POST(
    new Request(
      'https://example.org/api/digest/email/unsubscribe?token=t&list=weekly',
      { method: 'POST' },
    ),
  )
  expect(unsubscribe).toHaveBeenCalledWith('t', 'weekly')
  expect(response.headers.get('location')).toBe(
    'https://example.org/digest/week?email=unsubscribed',
  )
})
