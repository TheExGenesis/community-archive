import '@testing-library/jest-dom'
import { act, render, screen, waitFor } from '@testing-library/react'

import UserDirectoryClient, { USERS_PER_PAGE } from './UserDirectoryClient'
import { fetchUsers } from '@/lib/queries/fetchUsers'
import type { DirectoryUser } from '@/lib/types'

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({ kind: 'test-client' }),
}))

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

  test('requests and renders only the first 15 users without an exact count query', async () => {
    mockFetchUsers.mockResolvedValueOnce(
      Array.from({ length: USERS_PER_PAGE }, (_, index) =>
        directoryUser(index),
      ),
    )

    render(<UserDirectoryClient totalCount={740} />)

    expect(await screen.findByText('15 of 740 users')).toBeInTheDocument()
    expect(mockFetchUsers).toHaveBeenCalledTimes(1)
    expect(mockFetchUsers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 15, offset: 0 }),
    )
  })

  test('loads the next page when the scroll target enters view', async () => {
    mockFetchUsers
      .mockResolvedValueOnce(
        Array.from({ length: USERS_PER_PAGE }, (_, index) =>
          directoryUser(index),
        ),
      )
      .mockResolvedValueOnce([directoryUser(15), directoryUser(16)])

    render(<UserDirectoryClient totalCount={740} />)

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
    expect(mockFetchUsers).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ limit: 15, offset: 15 }),
    )
    expect(
      screen.queryByRole('button', { name: 'Load more users' }),
    ).not.toBeInTheDocument()
  })
})
