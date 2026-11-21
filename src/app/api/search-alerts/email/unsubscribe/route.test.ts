/**
 * @jest-environment node
 */
import { GET, POST } from './route'
import { disableSearchAlertEmailByToken } from '@/lib/searchAlerts/store'

jest.mock('@/lib/searchAlerts/store', () => ({
  disableSearchAlertEmailByToken: jest.fn(),
}))

test('one-click unsubscribe turns alert emails off and lands on settings', async () => {
  jest.mocked(disableSearchAlertEmailByToken).mockResolvedValue(true)
  const response = await POST(
    new Request(
      'https://example.org/api/search-alerts/email/unsubscribe?token=t',
      {
        method: 'POST',
      },
    ),
  )
  expect(disableSearchAlertEmailByToken).toHaveBeenCalledWith('t')
  expect(response.headers.get('location')).toBe(
    'https://example.org/settings?alertEmail=unsubscribed#search-alerts',
  )
})

test('unknown or missing tokens land on an invalid notice', async () => {
  jest.mocked(disableSearchAlertEmailByToken).mockResolvedValue(false)
  for (const url of [
    'https://example.org/api/search-alerts/email/unsubscribe?token=t',
    'https://example.org/api/search-alerts/email/unsubscribe',
  ]) {
    const response = await GET(new Request(url))
    expect(response.headers.get('location')).toContain('alertEmail=invalid')
  }
})
