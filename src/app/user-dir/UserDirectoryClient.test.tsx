import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import UserDirectoryClient, { USERS_PER_PAGE } from './UserDirectoryClient'
import { fetchUsers } from '@/lib/queries/fetchUsers'
import type { DirectoryUser } from '@/lib/types'
import { capturePostHogEvent } from '@/lib/posthog'
import {
  hideDirectoryUser,
  listHiddenDirectoryUsers,
  restoreDirectoryUser,
} from './actions'
jest.mock('./actions', () => ({
  hideDirectoryUser: jest.fn(),
  listHiddenDirectoryUsers: jest.fn(),
  restoreDirectoryUser: jest.fn(),
}))

jest.mock('@/lib/queries/fetchUsers', () => ({
  fetchUsers: jest.fn(),
  getDirectoryProfileHref: (user: DirectoryUser) => `/user/${user.username}`,
}))
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))

const mockFetchUsers = fetchUsers as jest.MockedFunction<typeof fetchUsers>

class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = []

  constructor(readonly callback: IntersectionObserverCallback) {
    IntersectionObserverMock.instances.push(this)
  }

  observe() {}
  disconnect() {}
  unobserve() {}
}

const directoryUser = (index: number): DirectoryUser => ({
  directory_id: `archive:${index}`,
  account_id: String(index),
  username: `member_${index}`,
  account_display_name: `Member ${index}`,
  avatar_media_url: null,
  num_followers: 1000 - index,
  has_archive: true,
  is_opted_in: false,
  opted_in_at: null,
  archive_uploaded_at: '2026-08-01T00:00:00Z',
  joined_at: '2026-08-01T00:00:00Z',
})

describe('UserDirectoryClient', () => {
  beforeEach(() => {
    mockFetchUsers.mockReset()
    ;(capturePostHogEvent as jest.Mock).mockReset()
    IntersectionObserverMock.instances = []
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: IntersectionObserverMock,
    })
  })

  test('keeps a non-BMP display-name initial intact for server hydration', () => {
    render(
      <UserDirectoryClient
        totalCount={1}
        initialUsers={[{ ...directoryUser(1), account_display_name: '𒐪' }]}
        initialHasMore={false}
      />,
    )
    // Both the name and avatar fallback must contain the complete code point.
    // A lone UTF-16 surrogate becomes U+FFFD when the server sends UTF-8 HTML.
    expect(screen.getAllByText('𒐪')).toHaveLength(2)
  })

  test('records profile opens using aggregate directory context', async () => {
    const initialUsers = [directoryUser(1)]
    render(
      <UserDirectoryClient
        totalCount={1}
        initialUsers={initialUsers}
        initialHasMore={false}
      />,
    )

    const profileLink = screen.getByRole('link', { name: /Member 1/ })
    profileLink.addEventListener('click', (event) => event.preventDefault())
    profileLink.click()

    expect(capturePostHogEvent).toHaveBeenCalledWith('user_directory_action', {
      action: 'profile_opened',
      has_query: false,
      sort_by: 'num_followers',
      sort_order: 'desc',
      visible_result_count: 1,
    })
  })

  test('records a settled directory search without sending its text', async () => {
    mockFetchUsers.mockResolvedValueOnce({
      users: [directoryUser(2)],
      hasMore: false,
    })
    render(
      <UserDirectoryClient
        totalCount={2}
        initialUsers={[directoryUser(1)]}
        initialHasMore={false}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Search users' }), {
      target: { value: 'sensitive name' },
    })

    await waitFor(() =>
      expect(capturePostHogEvent).toHaveBeenCalledWith(
        'user_directory_action',
        {
          action: 'searched',
          has_query: true,
          sort_by: 'num_followers',
          sort_order: 'desc',
          visible_result_count: 1,
        },
      ),
    )
  })

  test('renders the server-supplied first 15 users without a client refetch', async () => {
    const initialUsers = Array.from({ length: USERS_PER_PAGE }, (_, index) =>
      directoryUser(index),
    )

    render(
      <UserDirectoryClient
        totalCount={740}
        initialUsers={initialUsers}
        initialHasMore
      />,
    )

    expect(await screen.findByText('15 of 740 users')).toBeInTheDocument()
    expect(mockFetchUsers).not.toHaveBeenCalled()
  })

  test('loads the next page when the scroll target enters view', async () => {
    const initialUsers = Array.from({ length: USERS_PER_PAGE }, (_, index) =>
      directoryUser(index),
    )
    mockFetchUsers.mockResolvedValueOnce({
      users: [directoryUser(15), directoryUser(16)],
      hasMore: false,
    })

    render(
      <UserDirectoryClient
        totalCount={740}
        initialUsers={initialUsers}
        initialHasMore
      />,
    )

    await screen.findByText('15 of 740 users')
    await waitFor(() =>
      expect(IntersectionObserverMock.instances).toHaveLength(1),
    )

    const observer = IntersectionObserverMock.instances[0]
    await act(async () => {
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      )
    })

    expect(await screen.findByText('17 of 740 users')).toBeInTheDocument()
    expect(mockFetchUsers).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 15, offset: 15 }),
    )
    expect(
      screen.queryByRole('button', { name: 'Load more users' }),
    ).not.toBeInTheDocument()
  })

  test('loads in the browser when the server could not supply the first page', async () => {
    mockFetchUsers.mockResolvedValueOnce({
      users: [directoryUser(0)],
      hasMore: false,
    })

    render(
      <UserDirectoryClient
        totalCount={740}
        initialUsers={null}
        initialHasMore
      />,
    )

    expect(await screen.findByText('1 of 740 users')).toBeInTheDocument()
    expect(mockFetchUsers).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 15, offset: 0 }),
    )
  })
  test('retries a failed search from the first page without showing unrelated users', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockFetchUsers.mockRejectedValueOnce(new Error('offline'))
    mockFetchUsers.mockResolvedValueOnce({
      users: [directoryUser(2)],
      hasMore: false,
    })
    render(
      <UserDirectoryClient
        totalCount={20}
        initialUsers={[directoryUser(1)]}
        initialHasMore
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Search users' }), {
      target: { value: 'member_2' },
    })
    const retry = await screen.findByRole('button', {
      name: 'Retry loading users',
    })
    expect(
      screen.queryByRole('link', { name: /Member 1/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Load more users' }),
    ).not.toBeInTheDocument()
    fireEvent.click(retry)

    expect(
      await screen.findByRole('link', { name: /Member 2/ }),
    ).toBeInTheDocument()
    expect(mockFetchUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 0, search: 'member_2' }),
    )
    log.mockRestore()
  })
})

const renderDirectory = (isAdmin = false, initialNextOffset = 1) =>
  render(
    <UserDirectoryClient
      totalCount={null}
      isAdmin={isAdmin}
      initialUsers={[directoryUser(1)]}
      initialHasMore={true}
      initialNextOffset={initialNextOffset}
    />,
  )

describe('directory visibility controls', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetchUsers.mockResolvedValue({
      users: [],
      hasMore: false,
      nextOffset: 1,
    })
    jest.mocked(hideDirectoryUser).mockResolvedValue(undefined)
    jest.mocked(restoreDirectoryUser).mockResolvedValue(undefined)
    jest.mocked(listHiddenDirectoryUsers).mockResolvedValue([])
  })

  test('regular members do not see hide or restore controls', () => {
    renderDirectory()
    expect(
      screen.queryByRole('button', { name: 'Hidden users' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Hide @/ }),
    ).not.toBeInTheDocument()
  })

  test('admin hides a row and reloads from the first page', async () => {
    renderDirectory(true)
    fireEvent.click(
      screen.getByRole('button', { name: 'Hide @member_1 from directory' }),
    )
    await waitFor(() =>
      expect(hideDirectoryUser).toHaveBeenCalledWith('archive:1', 'member_1'),
    )
    await waitFor(() =>
      expect(screen.queryByText('Member 1')).not.toBeInTheDocument(),
    )
    expect(mockFetchUsers).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0 }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      '@member_1 hidden from the directory.',
    )
  })

  test('failed hide keeps the row and reports the error', async () => {
    jest
      .mocked(hideDirectoryUser)
      .mockRejectedValueOnce(new Error('Please try again.'))
    renderDirectory(true)
    fireEvent.click(
      screen.getByRole('button', { name: 'Hide @member_1 from directory' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please try again.',
    )
    expect(screen.getByText('Member 1')).toBeInTheDocument()
  })

  test('admin can restore from the hidden users list', async () => {
    jest.mocked(listHiddenDirectoryUsers).mockResolvedValueOnce([
      {
        visibility_key: 'id:42',
        account_id: '42',
        username: 'bot',
        hidden_by: null,
        hidden_at: '2026-10-29',
      },
    ])
    renderDirectory(true)
    fireEvent.click(screen.getByRole('button', { name: 'Hidden users' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Restore @bot to directory' }),
    )
    await waitFor(() =>
      expect(restoreDirectoryUser).toHaveBeenCalledWith('id:42'),
    )
    expect(await screen.findByText('No hidden users.')).toBeInTheDocument()
  })

  test('load more uses the source cursor rather than the visible row count', async () => {
    renderDirectory(false, 3)
    fireEvent.click(screen.getByRole('button', { name: /Load/ }))
    await waitFor(() =>
      expect(mockFetchUsers).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 3 }),
      ),
    )
  })
})
