import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { handleFileUpload } from '@/lib/upload-archive/handleFileUpload'
import type { Archive } from '@/lib/types'
import { ArchiveUploadButton } from './ArchiveUploadButton'

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({ auth: {} }),
}))

jest.mock('@/lib/upload-archive/handleFileUpload', () => ({
  handleFileUpload: jest.fn(),
}))

jest.mock('./file-upload-dialog', () => ({
  FileUploadDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog">Confirm archive upload</div> : null,
}))

const mockedHandleFileUpload = handleFileUpload as jest.MockedFunction<
  typeof handleFileUpload
>

describe('ArchiveUploadButton', () => {
  beforeEach(() => {
    mockedHandleFileUpload.mockReset()
  })

  it('opens the file picker and starts the upload flow in place', async () => {
    const user = userEvent.setup()
    const archive = {} as Archive
    mockedHandleFileUpload.mockResolvedValue(archive)

    render(
      <ArchiveUploadButton variant="outline">
        Upload Archive
      </ArchiveUploadButton>,
    )

    const fileInput = screen.getByLabelText(
      'Choose Twitter archive zip',
    ) as HTMLInputElement
    const clickSpy = jest.spyOn(fileInput, 'click')

    await user.click(screen.getByRole('button', { name: 'Upload Archive' }))
    expect(clickSpy).toHaveBeenCalledTimes(1)

    const requestLink = screen.getByRole('link', {
      name: 'Request your archive from X',
    })
    expect(requestLink).toHaveAttribute(
      'href',
      'https://x.com/settings/download_your_data',
    )
    expect(requestLink).toHaveAttribute('target', '_blank')

    const file = new File(['archive'], 'twitter-archive.zip', {
      type: 'application/zip',
    })
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(mockedHandleFileUpload).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Confirm archive upload',
    )
  })
})
