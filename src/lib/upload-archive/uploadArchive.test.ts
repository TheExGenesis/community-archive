import type { SupabaseClient } from '@supabase/supabase-js'
import type { Archive } from '../types'
import { insertArchiveForProcessing } from '@/lib/db_insert'
import { uploadArchiveToStorage } from './uploadArchiveToStorage'
import { uploadArchive } from './uploadArchive'

jest.mock('@/lib/db_insert', () => ({
  insertArchiveForProcessing: jest.fn(),
}))
jest.mock('./uploadArchiveToStorage', () => ({
  uploadArchiveToStorage: jest.fn(),
}))

const mockedInsert = jest.mocked(insertArchiveForProcessing)
const mockedUpload = jest.mocked(uploadArchiveToStorage)

describe('uploadArchive policy race cleanup', () => {
  it('removes the raw object when policy changes before the PostgreSQL sink', async () => {
    mockedUpload.mockResolvedValue('allowed_owner/archive.json')
    mockedInsert.mockRejectedValue(new Error('archive owner is blocked'))
    const remove = jest.fn().mockResolvedValue({ data: null, error: null })
    const from = jest.fn().mockReturnValue({ remove })
    const supabase = { storage: { from } } as unknown as SupabaseClient

    await expect(
      uploadArchive(supabase, jest.fn(), { account: [] } as unknown as Archive),
    ).rejects.toThrow('archive owner is blocked')

    expect(from).toHaveBeenCalledWith('archives')
    expect(remove).toHaveBeenCalledWith(['allowed_owner/archive.json'])
  })
})
