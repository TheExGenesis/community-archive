import { buildSitemap, getMemberProfileEntries } from '@/lib/sitemap'

type Row = {
  directory_id: string
  account_id: string | null
  username: string | null
  archive_uploaded_at: string | null
}

function clientReturning(rows: Row[], error: unknown = null) {
  const range = jest.fn(async (from: number, to: number) => ({
    data: error ? null : rows.slice(from, to + 1),
    error,
  }))
  const client = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn(() => ({ range })) })),
    })),
  }
  return { client: client as never, range }
}

const member = (index: number): Row => ({
  directory_id: `archive:${index}`,
  account_id: String(index),
  username: `member_${index}`,
  archive_uploaded_at: null,
})

describe('sitemap', () => {
  it('lists public pages and member profiles but no tweet permalinks', async () => {
    const { client } = clientReturning([
      {
        directory_id: 'archive:1',
        account_id: '1',
        username: 'alice',
        archive_uploaded_at: '2026-01-02T03:04:05Z',
      },
      {
        directory_id: 'optin:2',
        account_id: '2',
        username: null,
        archive_uploaded_at: null,
      },
    ])

    const entries = await buildSitemap(client)
    const urls = entries.map((entry) => entry.url)

    expect(urls).toContain('https://www.community-archive.org/')
    expect(urls).toContain('https://www.community-archive.org/user/alice')
    expect(urls).toContain('https://www.community-archive.org/user/2')
    expect(urls.some((url) => url.includes('/tweets/'))).toBe(false)
    expect(
      entries.find((entry) => entry.url.endsWith('/user/alice'))?.lastModified,
    ).toEqual(new Date('2026-01-02T03:04:05Z'))
  })

  it('pages past the PostgREST row cap', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => member(index))
    const { client, range } = clientReturning(rows)

    await expect(getMemberProfileEntries(client)).resolves.toHaveLength(1001)
    expect(range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('fails instead of returning a sitemap without profiles', async () => {
    const { client } = clientReturning([], new Error('upstream down'))

    await expect(buildSitemap(client)).rejects.toThrow('upstream down')
  })
})
