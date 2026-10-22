import {
  ArchiveUploadDeleteError,
  deleteArchiveUpload,
} from './archiveUploadApi'

const respond = (status: number, body?: unknown) =>
  jest.fn(async () =>
    body === undefined
      ? new Response('not json', { status })
      : new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch

describe('deleteArchiveUpload', () => {
  it('sends only the archive id', async () => {
    const fetchImpl = respond(200, { deleted: true, file: 'removed' })

    await deleteArchiveUpload(42, fetchImpl)

    expect(fetchImpl).toHaveBeenCalledWith('/api/archive-uploads/42', {
      method: 'DELETE',
    })
  })

  it('surfaces a partial delete so the caller can refresh', async () => {
    const error = await deleteArchiveUpload(
      42,
      respond(500, { error: 'File was not removed', archiveDeleted: true }),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ArchiveUploadDeleteError)
    expect(error).toMatchObject({
      message: 'File was not removed',
      archiveDeleted: true,
    })
  })

  it('falls back to a generic message', async () => {
    await expect(deleteArchiveUpload(42, respond(502))).rejects.toMatchObject({
      message: 'Failed to delete archive',
      archiveDeleted: false,
    })
  })
})
