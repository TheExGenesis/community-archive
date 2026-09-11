import React from 'react'
import { render, screen } from '@testing-library/react'
import OptInPage from './page'
import { getOptInStatus, requireAuth } from '@/lib/auth-utils'
import { isStagingOptInPreviewEnabled } from '@/lib/stagingOptInPreview'

jest.mock('@/lib/auth-utils', () => ({
  requireAuth: jest.fn(),
  getOptInStatus: jest.fn(),
}))
jest.mock('@/lib/stagingOptInPreview', () => ({
  isStagingOptInPreviewEnabled: jest.fn(),
}))
jest.mock('@/components/OptInForm', () => ({
  __esModule: true,
  default: () => <div>Opt-in form</div>,
}))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(requireAuth).mockResolvedValue({
    user: { id: 'member' },
  } as Awaited<ReturnType<typeof requireAuth>>)
  jest.mocked(isStagingOptInPreviewEnabled).mockReturnValue(false)
  jest.mocked(getOptInStatus).mockResolvedValue({ data: null, error: null })
})

test('explains the bulletin requirement and preserves the destination through login', async () => {
  render(await OptInPage({ searchParams: { redirect: '/bulletin' } }))
  expect(requireAuth).toHaveBeenCalledWith('/opt-in?redirect=/bulletin')
  expect(screen.getByText(/choose whether to opt in/i)).toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: /continue to the bulletin/i }),
  ).not.toBeInTheDocument()
})

test.each([false, true])(
  'only active consent offers the return link (opt-out: %s)',
  async (optedOut) => {
    jest.mocked(getOptInStatus).mockResolvedValue({
      data: { opted_in: true, explicit_optout: optedOut },
      error: null,
    } as Awaited<ReturnType<typeof getOptInStatus>>)
    render(await OptInPage({ searchParams: { redirect: '/bulletin' } }))
    const link = screen.queryByRole('link', {
      name: /continue to the bulletin/i,
    })
    if (optedOut) expect(link).not.toBeInTheDocument()
    else expect(link).toHaveAttribute('href', '/bulletin')
  },
)

test.each([undefined, 'https://example.com', ['/bulletin']])(
  'ignores unrelated or malformed redirect destinations: %s',
  async (redirect) => {
    render(await OptInPage({ searchParams: { redirect } }))
    expect(requireAuth).toHaveBeenCalledWith('/opt-in')
    expect(
      screen.queryByText(/the bulletin is available/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  },
)

test('mock opt-in never enables bulletin access', async () => {
  jest.mocked(isStagingOptInPreviewEnabled).mockReturnValue(true)
  render(
    await OptInPage({
      searchParams: { redirect: '/bulletin', mockOptIn: '1' },
    }),
  )
  expect(getOptInStatus).not.toHaveBeenCalled()
  expect(
    screen.queryByRole('link', { name: /continue to the bulletin/i }),
  ).not.toBeInTheDocument()
})
