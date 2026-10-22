import type { SupabaseClient } from '@supabase/supabase-js'
import {
  removeArchiveUploadObject,
  type DeletedArchiveUpload,
} from './removeArchiveUploadObject'

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const sha = 'a'.repeat(64)

type Row = Record<string, string | null>

// SQL ILIKE with backslash escapes, as PostgREST passes it through.
const ilike = (value: string | null, pattern: string) => {
  if (value === null) return false
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '\\') source += pattern[++i].replace(/\W/g, '\\$&')
    else if (char === '%') source += '.*'
    else if (char === '_') source += '.'
    else source += char.replace(/\W/g, '\\$&')
  }
  return new RegExp(`^${source}$`, 'i').test(value)
}

// Mimics the PostgREST filters and Storage calls the helper uses. Rows are
// what remains after delete_single_archive removed the deleted upload.
function fakeClient(
  tables: Record<string, Row[]>,
  objects: string[],
  options: {
    queryError?: string
    removeError?: string
    removeIsNoop?: boolean
  } = {},
) {
  const stored = new Set(objects)
  const queries: string[] = []

  const from = jest.fn((table: string) => {
    const filters: Array<(row: Row) => boolean> = []
    let head = false
    const builder = {
      select: (_columns: string, opts?: { head?: boolean }) => {
        head = Boolean(opts?.head)
        return builder
      },
      eq: (column: string, value: string) => {
        filters.push((row) => row[column] === value)
        return builder
      },
      is: (column: string, value: null) => {
        filters.push((row) => row[column] === value)
        return builder
      },
      in: (column: string, values: string[]) => {
        filters.push((row) => values.includes(row[column] ?? ''))
        return builder
      },
      ilike: (column: string, pattern: string) => {
        filters.push((row) => ilike(row[column], pattern))
        return builder
      },
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        queries.push(table)
        if (options.queryError) {
          return Promise.resolve({
            data: null,
            count: null,
            error: { message: options.queryError },
          }).then(resolve, reject)
        }
        const rows = (tables[table] ?? []).filter((row) =>
          filters.every((filter) => filter(row)),
        )
        return Promise.resolve(
          head
            ? { data: null, count: rows.length, error: null }
            : { data: rows, count: null, error: null },
        ).then(resolve, reject)
      },
    }
    return builder
  })

  const remove = jest.fn(async (paths: string[]) => {
    if (options.removeError) {
      return { data: null, error: { message: options.removeError } }
    }
    if (!options.removeIsNoop) paths.forEach((path) => stored.delete(path))
    return { data: [], error: null }
  })
  const list = jest.fn(async (prefix: string, opts: { search: string }) => {
    const entries = Array.from(stored)
      .filter((path) => path.startsWith(`${prefix}/`))
      .map((path) => path.slice(prefix.length + 1).split('/'))
      .map(([name, ...rest]) => ({ name, id: rest.length ? null : name }))
      .filter((entry) => entry.name.startsWith(opts.search))
    return { data: entries, error: null }
  })

  const client = {
    from,
    storage: { from: jest.fn(() => ({ list, remove })) },
  } as unknown as Pick<SupabaseClient, 'from' | 'storage'>
  return { client, stored, queries, remove, list }
}

const pinned = (owner: string, n: number): DeletedArchiveUpload => ({
  account_id: 'owner-id',
  storage_path: `${owner}/${uuid(n)}/archive.json`,
  storage_sha256: sha,
})
const legacy: DeletedArchiveUpload = {
  account_id: 'owner-id',
  storage_path: null,
  storage_sha256: null,
}

describe('removeArchiveUploadObject', () => {
  it("removes only the deleted upload's pinned object", async () => {
    const fake = fakeClient({ archive_upload: [] }, [
      'owner/archive.json',
      `owner/${uuid(1)}/archive.json`,
      `owner/${uuid(2)}/archive.json`,
      `other/${uuid(3)}/archive.json`,
    ])

    await expect(
      removeArchiveUploadObject(fake.client, 'Owner', pinned('owner', 1)),
    ).resolves.toBe('removed')

    expect(fake.remove).toHaveBeenCalledWith([`owner/${uuid(1)}/archive.json`])
    expect(Array.from(fake.stored).sort()).toEqual([
      `other/${uuid(3)}/archive.json`,
      `owner/${uuid(2)}/archive.json`,
      'owner/archive.json',
    ])
  })

  it('keeps a pinned object that another row still references', async () => {
    const upload = pinned('owner', 1)
    const fake = fakeClient(
      {
        archive_upload: [
          { account_id: 'owner-id', storage_path: upload.storage_path },
        ],
      },
      [upload.storage_path!],
    )

    await expect(
      removeArchiveUploadObject(fake.client, 'owner', upload),
    ).resolves.toBe('referenced')
    expect(fake.remove).not.toHaveBeenCalled()
    expect(fake.stored.has(upload.storage_path!)).toBe(true)
  })

  it('removes an unreferenced legacy object and keeps pinned uploads', async () => {
    const fake = fakeClient(
      {
        all_account: [{ account_id: 'owner-id', username: 'Owner' }],
        archive_upload: [
          {
            account_id: 'owner-id',
            username: 'Owner',
            storage_path: `owner/${uuid(1)}/archive.json`,
          },
        ],
      },
      ['owner/archive.json', `owner/${uuid(1)}/archive.json`],
    )

    await expect(
      removeArchiveUploadObject(fake.client, 'owner', legacy),
    ).resolves.toBe('removed')

    expect(fake.remove).toHaveBeenCalledWith(['owner/archive.json'])
    expect(Array.from(fake.stored)).toEqual([`owner/${uuid(1)}/archive.json`])
  })

  it.each<[string, Record<string, Row[]>]>([
    [
      'another legacy upload of the same account',
      {
        archive_upload: [
          { account_id: 'owner-id', username: null, storage_path: null },
        ],
      },
    ],
    [
      'a legacy upload recorded under the same handle',
      {
        archive_upload: [
          { account_id: 'old-id', username: 'OWNER', storage_path: null },
        ],
      },
    ],
    [
      'a legacy upload of an account that holds the handle',
      {
        all_account: [{ account_id: 'renamed-id', username: 'Owner' }],
        archive_upload: [
          { account_id: 'renamed-id', username: null, storage_path: null },
        ],
      },
    ],
  ])('keeps a legacy object still referenced by %s', async (_, tables) => {
    const fake = fakeClient(tables, ['owner/archive.json'])

    await expect(
      removeArchiveUploadObject(fake.client, 'owner', legacy),
    ).resolves.toBe('referenced')
    expect(fake.remove).not.toHaveBeenCalled()
    expect(fake.stored.has('owner/archive.json')).toBe(true)
  })

  it('matches underscores in a handle literally', async () => {
    const fake = fakeClient(
      {
        all_account: [{ account_id: 'lookalike-id', username: 'ownerx1' }],
        archive_upload: [
          {
            account_id: 'lookalike-id',
            username: 'ownerx1',
            storage_path: null,
          },
        ],
      },
      ['owner_1/archive.json', 'ownerx1/archive.json'],
    )

    await expect(
      removeArchiveUploadObject(fake.client, 'owner_1', legacy),
    ).resolves.toBe('removed')
    expect(Array.from(fake.stored)).toEqual(['ownerx1/archive.json'])
  })

  it.each([
    ['another owner', pinned('victim', 1)],
    ['a prefix of the owner', pinned('own', 1)],
    [
      'a traversal path',
      { ...pinned('owner', 1), storage_path: `owner/../victim/archive.json` },
    ],
    ['a missing digest', { ...pinned('owner', 1), storage_sha256: null }],
  ])('never touches Storage for a row that points at %s', async (_, upload) => {
    const fake = fakeClient({ archive_upload: [] }, [
      `victim/${uuid(1)}/archive.json`,
      `own/${uuid(1)}/archive.json`,
    ])

    await expect(
      removeArchiveUploadObject(fake.client, 'owner', upload),
    ).resolves.toBe('outside_owner')
    expect(fake.queries).toEqual([])
    expect(fake.remove).not.toHaveBeenCalled()
    expect(fake.list).not.toHaveBeenCalled()
  })

  it('treats an object that is already gone as removed', async () => {
    const fake = fakeClient({ archive_upload: [] }, [])

    await expect(
      removeArchiveUploadObject(fake.client, 'owner', pinned('owner', 1)),
    ).resolves.toBe('removed')
  })

  it('does not remove anything when the reference check fails', async () => {
    const fake = fakeClient({ archive_upload: [] }, ['owner/archive.json'], {
      queryError: 'statement timeout',
    })

    await expect(
      removeArchiveUploadObject(fake.client, 'owner', legacy),
    ).rejects.toThrow('Failed to check archive references: statement timeout')
    expect(fake.remove).not.toHaveBeenCalled()
  })

  it('reports a Storage removal error', async () => {
    const fake = fakeClient(
      { archive_upload: [] },
      [`owner/${uuid(1)}/archive.json`],
      { removeError: 'storage unavailable' },
    )

    await expect(
      removeArchiveUploadObject(fake.client, 'owner', pinned('owner', 1)),
    ).rejects.toThrow('Failed to remove archive file: storage unavailable')
  })

  it('fails when remove() reports success but the object remains', async () => {
    const fake = fakeClient(
      { archive_upload: [] },
      [`owner/${uuid(1)}/archive.json`],
      { removeIsNoop: true },
    )

    await expect(
      removeArchiveUploadObject(fake.client, 'owner', pinned('owner', 1)),
    ).rejects.toThrow('Archive file was not removed')
  })
})
