import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExtensionInstallPrompt from '@/components/ExtensionInstallPrompt'
import { useBrowserExtensionStatus } from '@/hooks/useBrowserExtensionStatus'
import { CHROME_EXTENSION_URL } from '@/lib/browserExtension'

jest.mock('@/hooks/useBrowserExtensionStatus', () => ({
  useBrowserExtensionStatus: jest.fn(),
}))

const mockStatus = useBrowserExtensionStatus as jest.MockedFunction<
  typeof useBrowserExtensionStatus
>

describe('ExtensionInstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    mockStatus.mockReturnValue('not-installed')
  })

  test('links directly to the extension and remembers dismissal', async () => {
    const user = userEvent.setup()
    render(<ExtensionInstallPrompt surface="trends" />)

    const installLink = await screen.findByRole('link', {
      name: /install the browser extension/i,
    })
    expect(installLink).toHaveAttribute('href', CHROME_EXTENSION_URL)
    expect(screen.getByText(/fresher trend data/i)).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: /hide browser extension suggestion/i,
      }),
    )
    expect(
      screen.queryByRole('link', { name: /install the browser extension/i }),
    ).not.toBeInTheDocument()
    expect(localStorage.length).toBe(1)
  })

  test('stays hidden when the extension is installed', () => {
    mockStatus.mockReturnValue('installed')
    render(<ExtensionInstallPrompt surface="stream" />)

    expect(
      screen.queryByRole('link', { name: /install the browser extension/i }),
    ).not.toBeInTheDocument()
  })
})
