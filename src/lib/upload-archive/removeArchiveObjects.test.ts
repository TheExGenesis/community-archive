import type { SupabaseClient } from '@supabase/supabase-js'
import { removeArchiveObjects } from './removeArchiveObjects'

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`

// Mimics Supabase Storage list(): one level per call, with folders returned
// as entries whose id is null.
function fakeStorage(
  initial: string[],
  options: {
    listError?: string
    removeError?: string
    removeIsNoop?: boolean
  } = {},
) {
  const objects = new Set(initial)
  const list = jest.fn(
    async (prefix: string, page: { limit: number; offset: number }) => {
      if (options.listError) {
        return { data: null, error: { message: options.listError } }
      }
      const children = new Map<string, { name: string; id: string | null }>()
      for (const path of Array.from(objects)) {
        if (!path.startsWith(`${prefix}/`)) continue
        const [name, ...rest] = path.slice(prefix.length + 1).split('/')
        children.set(name, { name, id: rest.length ? null : `id:${path}` })
      }
      const entries = Array.from(children.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      )
      return {
        data: entries.slice(page.offset, page.offset + page.limit),
        error: null,
      }
    },
  )
  const remove = jest.fn(async (paths: string[]) => {
    if (options.removeError) {
      return { data: null, error: { message: options.removeError } }
    }
    if (!options.removeIsNoop) paths.forEach((path) => objects.delete(path))
    return { data: [], error: null }
  })
  const from = jest.fn(() => ({ list, remove }))
  const client = { storage: { from } } as unknown as Pick<
    SupabaseClient,
    'storage'
  >
  return { client, objects, from, list, remove }
}

describe('removeArchiveObjects', () => {
  it('removes legacy and pinned uploads without touching other owners', async () => {
    const storage = fakeStorage([
      'owner/archive.json',
      `owner/${uuid(1)}/archive.json`,
      `owner/${uuid(2)}/archive.json`,
      `owner_2/${uuid(3)}/archive.json`,
      `other/${uuid(4)}/archive.json`,
    ])

    await expect(removeArchiveObjects(storage.client, 'Owner')).resolves.toBe(3)

    expect(storage.from).toHaveBeenCalledWith('archives')
    expect(Array.from(storage.objects).sort()).toEqual([
      `other/${uuid(4)}/archive.json`,
      `owner_2/${uuid(3)}/archive.json`,
    ])
  })

  it('pages through large folders and removes in batches', async () => {
    const pinned = Array.from(
      { length: 1205 },
      (_, n) => `owner/${uuid(n)}/archive.json`,
    )
    const storage = fakeStorage(['owner/archive.json', ...pinned])

    await expect(removeArchiveObjects(storage.client, 'owner')).resolves.toBe(
      1206,
    )

    expect(storage.objects.size).toBe(0)
    expect(storage.list).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({ limit: 1000, offset: 1000 }),
    )
    for (const [paths] of storage.remove.mock.calls) {
      expect(paths.length).toBeLessThanOrEqual(100)
    }
  })

  it('succeeds without removing anything when the folder is empty', async () => {
    const storage = fakeStorage([`other/${uuid(1)}/archive.json`])

    await expect(removeArchiveObjects(storage.client, 'owner')).resolves.toBe(0)
    expect(storage.remove).not.toHaveBeenCalled()
    expect(storage.objects.size).toBe(1)
  })

  it.each(['', 'a/b', '../owner', 'owner%', 'x'.repeat(16)])(
    'rejects the invalid owner %j before touching storage',
    async (username) => {
      const storage = fakeStorage(['owner/archive.json'])

      await expect(
        removeArchiveObjects(storage.client, username),
      ).rejects.toThrow('Invalid archive owner username')
      expect(storage.from).not.toHaveBeenCalled()
    },
  )

  it('fails when listing fails', async () => {
    const storage = fakeStorage(['owner/archive.json'], {
      listError: 'list down',
    })

    await expect(removeArchiveObjects(storage.client, 'owner')).rejects.toThrow(
      'Failed to list archive files: list down',
    )
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('fails when removal fails', async () => {
    const storage = fakeStorage(['owner/archive.json'], {
      removeError: 'remove down',
    })

    await expect(removeArchiveObjects(storage.client, 'owner')).rejects.toThrow(
      'Failed to remove archive files: remove down',
    )
  })

  it('fails when objects survive a removal that reported success', async () => {
    const storage = fakeStorage(
      ['owner/archive.json', `owner/${uuid(1)}/archive.json`],
      { removeIsNoop: true },
    )

    await expect(removeArchiveObjects(storage.client, 'owner')).rejects.toThrow(
      '2 archive files were not removed',
    )
  })
})
