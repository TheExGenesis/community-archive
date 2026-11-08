import {
  insertArchiveForProcessing,
  retryOperation,
  setUploadPhase,
} from './db_insert'
import type { SupabaseClient } from '@supabase/supabase-js'

type Call = { table: string; method: string; args: unknown[] }
type Result = { data?: unknown; error?: unknown }

// A chainable supabase-js stub. Every builder method is recorded; awaiting a
// chain resolves to the next queued result for its table (supabase-js
// resolves with `{ data, error }`, it does not throw).
const makeSupabase = (results: Record<string, Result[]>) => {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {}
      for (const method of [
        'select',
        'insert',
        'update',
        'upsert',
        'eq',
        'in',
        'order',
        'limit',
        'maybeSingle',
        'single',
      ]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args })
          return builder
        }
      }
      builder.then = (
        resolve: (value: Result) => unknown,
        reject: (reason: unknown) => unknown,
      ) => {
        const next = results[table]?.shift() ?? { data: null, error: null }
        return Promise.resolve({ data: null, error: null, ...next }).then(
          resolve,
          reject,
        )
      }
      return builder
    },
  }
  return { supabase: client as unknown as SupabaseClient, calls }
}

const fast = { maxRetries: 2, retryDelay: 1 }

describe('setUploadPhase', () => {
  it('moves ready_for_commit only from uploading', async () => {
    const { supabase, calls } = makeSupabase({
      archive_upload: [{ data: [{ id: 123 }] }],
    })

    await expect(
      setUploadPhase(supabase, 123, 'ready_for_commit'),
    ).resolves.toBeUndefined()
    expect(calls.map(({ method, args }) => [method, ...args])).toEqual([
      ['update', { upload_phase: 'ready_for_commit' }],
      ['eq', 'id', 123],
      ['in', 'upload_phase', ['uploading']],
      ['select', 'id'],
    ])
  })

  it('marks failed only from the client-owned phases', async () => {
    const { supabase, calls } = makeSupabase({
      archive_upload: [{ data: [{ id: 123 }] }],
    })

    await setUploadPhase(supabase, 123, 'failed')
    expect(calls).toContainEqual({
      table: 'archive_upload',
      method: 'in',
      args: ['upload_phase', ['uploading', 'ready_for_commit']],
    })
  })

  it('rejects when supabase returns an error (regression: error must not be swallowed)', async () => {
    // Before the fix, the destructured `error` was dropped, so a failed phase update
    // resolved silently and left the row stuck. It must now propagate.
    const error = { message: 'permission denied for table archive_upload' }
    const { supabase } = makeSupabase({
      archive_upload: [{ error }, { error }],
    })

    await expect(setUploadPhase(supabase, 123, 'failed', fast)).rejects.toThrow(
      /Error updating archive upload phase to failed/,
    )
  })

  it('rejects when the row already left the client-owned phases', async () => {
    const { supabase } = makeSupabase({
      archive_upload: [{ data: [] }, { data: [] }],
    })

    await expect(
      setUploadPhase(supabase, 123, 'ready_for_commit', fast),
    ).rejects.toThrow(/no longer in uploading/)
  })
})

describe('insertArchiveForProcessing', () => {
  const archive = {
    account: [
      {
        account: {
          accountId: '42',
          username: 'owner',
          createdAt: '2020-01-01T00:00:00.000Z',
          accountDisplayName: 'Owner',
        },
      },
    ],
    tweets: [{ tweet: { created_at: '2024-05-01T00:00:00.000Z' } }],
    following: [],
    follower: [],
    like: [],
  } as never

  it('reuses an unfinished row only while it is still unclaimed', async () => {
    const { supabase, calls } = makeSupabase({
      archive_upload: [
        { data: { id: 7, archive_at: '2024-01-01', storage_path: null } },
        { data: { id: 7 } },
        { data: [{ id: 7 }] },
      ],
    })

    await insertArchiveForProcessing(supabase, archive, () => {})

    const reuseFilters = calls.filter(
      (call) => call.table === 'archive_upload' && call.method === 'in',
    )
    expect(reuseFilters[1]).toEqual({
      table: 'archive_upload',
      method: 'in',
      args: ['upload_phase', ['uploading', 'ready_for_commit']],
    })
    expect(calls.some((call) => call.method === 'insert')).toBe(false)
  })

  it('inserts a new row when the worker claimed the old one meanwhile', async () => {
    const { supabase, calls } = makeSupabase({
      archive_upload: [
        { data: { id: 7, archive_at: '2024-01-01', storage_path: null } },
        { data: null },
        { data: { id: 8 } },
        { data: [{ id: 8 }] },
      ],
    })

    await insertArchiveForProcessing(supabase, archive, () => {})

    expect(calls.filter((call) => call.method === 'insert')).toHaveLength(1)
    expect(calls).toContainEqual({
      table: 'archive_upload',
      method: 'eq',
      args: ['id', 8],
    })
  })
})

describe('retryOperation', () => {
  it('retries then succeeds', async () => {
    let calls = 0
    const result = await retryOperation(
      async () => {
        calls++
        if (calls < 2) throw new Error('transient')
        return 'ok'
      },
      'should not surface',
      { retryDelay: 1 },
    )
    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })
})
