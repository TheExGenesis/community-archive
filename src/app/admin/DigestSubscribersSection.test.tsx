import { render, screen } from '@testing-library/react'
import { DigestSubscribersSection } from './DigestSubscribersSection'
import { loadDigestSubscribers } from './digestSubscribersData'

jest.mock('./digestSubscribersData', () => ({
  DIGEST_SUBSCRIBERS_PAGE_SIZE: 50,
  loadDigestSubscribers: jest.fn(),
}))

test('shows addresses, subscription dates, and navigation while preserving account search', async () => {
  jest.mocked(loadDigestSubscribers).mockResolvedValueOnce({
    rows: [
      {
        id: 'one',
        email: 'reader@example.com',
        confirmed_at: '2026-09-15T01:00:00Z',
      },
    ],
    total: 101,
    page: 2,
  })
  render(await DigestSubscribersSection({ page: 2, search: 'xiq' }))
  expect(screen.getByText('reader@example.com')).toBeInTheDocument()
  expect(screen.getByText('15 Sept 2026')).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Previous subscribers' }),
  ).toHaveAttribute('href', '/admin?subscriberPage=1&q=xiq#digest-subscribers')
  expect(
    screen.getByRole('link', { name: 'Next subscribers' }),
  ).toHaveAttribute('href', '/admin?subscriberPage=3&q=xiq#digest-subscribers')
})

test('shows an empty state without pagination links', async () => {
  jest
    .mocked(loadDigestSubscribers)
    .mockResolvedValueOnce({ rows: [], total: 0, page: 1 })
  render(await DigestSubscribersSection({}))
  expect(screen.getByText('No active subscribers yet.')).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

test('reports loading failure rather than an empty mailing list', async () => {
  jest
    .mocked(loadDigestSubscribers)
    .mockRejectedValueOnce(new Error('Unavailable'))
  render(await DigestSubscribersSection({}))
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Subscribers could not be loaded',
  )
  expect(
    screen.queryByText('No active subscribers yet.'),
  ).not.toBeInTheDocument()
})
