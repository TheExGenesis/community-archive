/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DownloadArchiveButton } from './DownloadArchiveButton'
;(globalThis as typeof globalThis & { React: typeof React }).React = React

const download = jest.fn()
const from = jest.fn(() => ({ download }))

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({ storage: { from } }),
}))

describe('DownloadArchiveButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    download.mockResolvedValue({
      data: new Blob(['archive']),
      error: null,
    })
    window.URL.createObjectURL = jest.fn(() => 'blob:archive')
    window.URL.revokeObjectURL = jest.fn()
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('downloads through authenticated Supabase storage', async () => {
    const user = userEvent.setup()
    render(<DownloadArchiveButton username="ArchiveMember" />)

    await user.click(
      screen.getByRole('button', { name: /download raw archive/i }),
    )

    await waitFor(() => {
      expect(from).toHaveBeenCalledWith('archives')
      expect(download).toHaveBeenCalledWith('archivemember/archive.json')
    })
    expect(window.URL.createObjectURL).toHaveBeenCalled()
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:archive')
  })
})
