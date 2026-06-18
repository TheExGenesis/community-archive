import { setUploadPhase, retryOperation } from './db_insert'
import type { SupabaseClient } from '@supabase/supabase-js'

// Builds a minimal supabase-js stub for `supabase.from(t).update(v).eq('id', id)`,
// resolving the awaited chain to `{ error }` (supabase-js resolves, it does not throw).
const makeSupabase = (error: unknown, onUpdate?: (v: unknown) => void) =>
  ({
    from: () => ({
      update: (v: unknown) => {
        onUpdate?.(v)
        return { eq: () => Promise.resolve({ error }) }
      },
    }),
  }) as unknown as SupabaseClient

describe('setUploadPhase', () => {
  it('resolves and issues the phase update when there is no error', async () => {
    const updates: unknown[] = []
    const supabase = makeSupabase(null, (v) => updates.push(v))

    await expect(setUploadPhase(supabase, 123, 'ready_for_commit')).resolves.toBeUndefined()
    expect(updates).toEqual([{ upload_phase: 'ready_for_commit' }])
  })

  it('rejects when supabase returns an error (regression: error must not be swallowed)', async () => {
    // Before the fix, the destructured `error` was dropped, so a failed phase update
    // resolved silently and left the row stuck. It must now propagate.
    const supabase = makeSupabase({ message: 'permission denied for table archive_upload' })

    await expect(setUploadPhase(supabase, 123, 'failed')).rejects.toThrow(
      /Error updating archive upload phase to failed/,
    )
  }, 15000) // retryOperation backs off 5x before giving up
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
