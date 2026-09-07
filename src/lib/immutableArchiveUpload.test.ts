import type { SupabaseClient } from '@supabase/supabase-js'
import type { Archive } from './types'
import { insertArchiveForProcessing } from './db_insert'

test('an immutable upload creates its own row and keeps the verified path owner', async () => {
  const legacyQuery: any = {}
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) legacyQuery[method] = jest.fn(() => legacyQuery)
  legacyQuery.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 99, archive_at: '2026-09-01', storage_path: null }, error: null })
  const insert = jest.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 100 }, error: null }) }) }))
  const phaseId = jest.fn().mockResolvedValue({ error: null })
  const update = jest.fn(() => ({ eq: phaseId }))
  const client = { from: (table: string) => table === 'all_account'
    ? { upsert: async () => ({ error: null }) }
    : { ...legacyQuery, insert, update } } as unknown as SupabaseClient
  const reference = { storage_path: 'current_owner/12345678-1234-1234-1234-123456789abc/archive.json', storage_sha256: 'a'.repeat(64) }
  await insertArchiveForProcessing(client, {
    account: [{ account: { accountId: '123', username: 'previous_owner', createdAt: '2020-01-01', accountDisplayName: 'Fixture' } }],
    tweets: [{ tweet: { created_at: '2026-09-01T00:00:00Z' } }],
  } as unknown as Archive, jest.fn(), reference)
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ ...reference, username: 'current_owner', account_id: '123' }))
  expect(update).toHaveBeenCalledTimes(1)
  expect(update).toHaveBeenCalledWith({ upload_phase: 'ready_for_commit' })
  expect(phaseId).toHaveBeenCalledWith('id', 100)
})
