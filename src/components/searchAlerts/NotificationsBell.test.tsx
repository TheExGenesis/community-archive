import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NotificationsBell } from './NotificationsBell'
import { CreateSearchAlert } from './CreateSearchAlert'
import { useNavigationAudience } from '@/components/NavigationAudience'

jest.mock('@/components/NavigationAudience', () => ({
  useNavigationAudience: jest.fn(),
}))
jest.mock('next/navigation', () => ({ usePathname: () => '/' }))
jest.mock('@/lib/productAnalytics', () => ({ captureProductAction: jest.fn() }))

const audience = (searchAlerts: boolean) =>
  jest.mocked(useNavigationAudience).mockReturnValue({
    isMember: searchAlerts,
    isAdmin: searchAlerts,
    askEnabled: false,
    askVisible: false,
    searchAlerts,
  } as never)

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as never
})

const reply = (body: unknown) =>
  Promise.resolve({ ok: true, json: async () => body } as Response)

test('signed-out or ineligible visitors get no bell, no control and no request', () => {
  audience(false)
  const { container } = render(
    <>
      <NotificationsBell />
      <CreateSearchAlert query="community archive" />
    </>,
  )
  expect(container).toBeEmptyDOMElement()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('eligible accounts see the unread badge and the list on open', async () => {
  audience(true)
  fetchMock.mockImplementation((url: string) =>
    url.includes('view=count')
      ? reply({ unreadCount: 2 })
      : reply({
          unreadCount: 1,
          notifications: [
            {
              id: 'n1',
              kind: 'search_alert',
              alertId: 'a1',
              query: 'community archive',
              fromUser: null,
              count: 4,
              since: '2026-11-20T08:00:00Z',
              updatedAt: new Date().toISOString(),
              readAt: null,
            },
          ],
        }),
  )
  render(<NotificationsBell />)
  expect(
    await screen.findByRole('button', { name: 'Notifications, 2 unread' }),
  ).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/notifications?view=count',
    expect.objectContaining({ cache: 'no-store' }),
  )

  fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
  const link = await screen.findByRole('link', { name: /community archive/ })
  expect(link).toHaveAttribute('href', '/notifications/n1')
  expect(link).toHaveTextContent('4 new matches')
})

test('the create control saves the current search with the email choice', async () => {
  audience(true)
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? reply({
          alert: {
            id: 'a1',
            query: 'community archive',
            mode: 'phrase',
            fromUser: null,
            emailEnabled: true,
          },
        })
      : reply({ alerts: [] }),
  )
  render(<CreateSearchAlert query="community archive" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Create alert' }))
  fireEvent.click(screen.getByRole('switch', { name: 'Daily email' }))
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Create alert' }).at(-1)!,
  )
  await waitFor(() => expect(screen.getByText('Alert on')).toBeInTheDocument())
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(post![1].body)).toEqual({
    query: 'community archive',
    fromUser: null,
    emailEnabled: true,
  })
})
