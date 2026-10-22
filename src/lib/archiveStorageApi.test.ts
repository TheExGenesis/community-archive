import { deleteOwnArchiveFiles } from './archiveStorageApi'

describe('deleteOwnArchiveFiles', () => {
  it('asks the server to delete the session owner’s files', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response('{"removed":2}', { status: 200 }))

    await expect(deleteOwnArchiveFiles(fetchImpl)).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledWith('/api/archive', {
      method: 'DELETE',
    })
  })

  it('surfaces the server error', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response('{"error":"Failed to delete archive files"}', {
        status: 500,
      }),
    )

    await expect(deleteOwnArchiveFiles(fetchImpl)).rejects.toThrow(
      'Failed to delete archive files',
    )
  })

  it('falls back to a generic error for a non-JSON failure', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response('Bad gateway', { status: 502 }))

    await expect(deleteOwnArchiveFiles(fetchImpl)).rejects.toThrow(
      'Failed to delete archive files',
    )
  })
})
