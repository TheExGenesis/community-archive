import { getUserDirectoryPage } from './userDirectory'

describe('getUserDirectoryPage', () => {
  test('maps the ClickHouse gateway response into directory users', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      data: {
        users: [
          {
            directoryId: 'id:42',
            accountId: '42',
            username: 'alice',
            displayName: 'Alice',
            avatarUrl: 'https://pbs.twimg.com/alice.jpg',
            followerCount: '1234',
            joinedAt: '2026-08-01T00:00:00.000Z',
            hasArchive: true,
            isOptedIn: false,
          },
        ],
      },
      pagination: { hasMore: true },
    })
    const params = new URLSearchParams({ limit: '15', offset: '30' })

    await expect(getUserDirectoryPage(params, fetcher)).resolves.toEqual({
      users: [
        {
          directory_id: 'id:42',
          account_id: '42',
          username: 'alice',
          account_display_name: 'Alice',
          avatar_media_url: 'https://pbs.twimg.com/alice.jpg',
          num_followers: 1234,
          has_archive: true,
          is_opted_in: false,
          opted_in_at: null,
          archive_uploaded_at: null,
          joined_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      hasMore: true,
    })
    expect(fetcher).toHaveBeenCalledWith(['member-directory'], params, {
      revalidate: 30,
      timeoutMs: 8_000,
    })
  })
})
