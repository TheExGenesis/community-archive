/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { YouCard } from './MemberPanels'

jest.mock('@/hooks/useBrowserExtensionStatus', () => ({
  useBrowserExtensionStatus: () => 'not-installed',
}))
jest.mock('@/components/ArchiveUploadButton', () => ({
  ArchiveUploadButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  useArchiveUpload: () => ({
    openPicker: jest.fn(),
    isProcessing: false,
    elements: null,
  }),
}))
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))

const completed = {
  archiveAt: '2025-03-01T00:00:00Z',
  uploadedAt: '2025-03-04T00:00:00Z',
  phase: 'completed' as const,
  numTweets: 41203,
}

describe('YouCard', () => {
  it('links a profile once the account is in the directory', () => {
    const { rerender } = render(
      <YouCard
        accountId="123"
        username="someone"
        optedIn={false}
        archive={null}
        archiveStale={false}
      />,
    )
    expect(screen.queryByRole('link', { name: /Your profile/ })).toBeNull()
    expect(screen.getByRole('link', { name: /settings/ })).toHaveAttribute(
      'href',
      '/settings',
    )

    rerender(
      <YouCard
        accountId="123"
        username="someone"
        optedIn
        archive={null}
        archiveStale={false}
      />,
    )
    expect(screen.getByRole('link', { name: /Your profile/ })).toHaveAttribute(
      'href',
      '/user/someone',
    )
  })

  it('walks a signed-in account without an archive through setup', () => {
    render(
      <YouCard
        accountId="123"
        username="someone"
        optedIn
        archive={null}
        archiveStale={false}
      />,
    )
    // Finished steps fold into a summary line instead of keeping their row.
    expect(screen.queryByText('Opt in to tweet streaming')).toBeNull()
    expect(screen.getByText('Opted in')).toBeInTheDocument()
    // Each open step is a single clickable row.
    expect(
      screen.getByRole('button', { name: /Upload your archive/ }),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: /Install the browser extension/ }),
    ).toHaveAttribute('href', expect.stringContaining('chromewebstore'))
  })

  it('folds a fresh archive into the done line and keeps other steps open', () => {
    render(
      <YouCard
        accountId="123"
        username="someone"
        optedIn
        archive={completed}
        archiveStale={false}
      />,
    )
    // The exact count, not a rounded 41.2K.
    expect(screen.getByText('41,203 tweets archived')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Your profile/ })).toHaveAttribute(
      'href',
      '/user/someone',
    )
    expect(screen.getByText('Archive uploaded')).toBeInTheDocument()
    expect(screen.getByText('Opted in')).toBeInTheDocument()
    // The extension is still open, so its row stays.
    expect(
      screen.getByRole('link', { name: /Install the browser extension/ }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/posts are missing/)).toBeNull()
  })

  it('turns a stale archive back into an open step with the X export link', () => {
    render(
      <YouCard
        accountId="123"
        username="someone"
        optedIn
        archive={completed}
        archiveStale
      />,
    )
    expect(
      screen.getByRole('button', { name: /Upload a newer archive/ }),
    ).toBeVisible()
    expect(screen.getByText(/months of posts are missing/)).toBeVisible()
    expect(
      screen.getByRole('link', { name: /Request a new export from X/ }),
    ).toHaveAttribute('href', 'https://x.com/settings/download_your_data')
    expect(screen.queryByText('Archive uploaded')).toBeNull()
  })

  it('offers the upload again when the last one failed', () => {
    render(
      <YouCard
        accountId="123"
        username="someone"
        optedIn
        archive={{ ...completed, phase: 'failed' }}
        archiveStale={false}
      />,
    )
    expect(
      screen.getByRole('button', { name: /Upload your archive again/ }),
    ).toBeVisible()
    expect(screen.getByText(/didn.t finish processing/)).toBeInTheDocument()
  })
})
