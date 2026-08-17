import '@testing-library/jest-dom'
import { act, render, screen, waitFor } from '@testing-library/react'

import UserDirectoryClient, { USERS_PER_PAGE } from './UserDirectoryClient'
import { fetchUsers } from '@/lib/queries/fetchUsers'
import type { DirectoryUser } from '@/lib/types'

jest.mock('@/lib/queries/fetchUsers', () => ({
  fetchUsers: jest.fn(),
  getDirectoryProfileHref: (user: DirectoryUser) => `/user/${user.username}`,
}))

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
    IntersectionObserverMock.instances = []
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: IntersectionObserverMock,
    })
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
})
