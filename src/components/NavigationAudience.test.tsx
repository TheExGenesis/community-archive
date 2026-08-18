/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import {
  AdminNavigationLink,
  AudienceHeaderNavigation,
  NavigationAudienceProvider,
} from './NavigationAudience'

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

describe('NavigationAudience', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise(() => {}))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('server-renders public navigation before checking the session', () => {
    render(
      <NavigationAudienceProvider>
        <AudienceHeaderNavigation kind="primary" />
        <AdminNavigationLink />
      </NavigationAudienceProvider>,
    )

    expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Upload archive' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Trends' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Admin dashboard' })).toBeNull()
  })

  it('adds member and admin navigation after session hydration', async () => {
    jest.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ isMember: true, isAdmin: true }),
    } as Response)

    render(
      <NavigationAudienceProvider>
        <AudienceHeaderNavigation kind="primary" />
        <AdminNavigationLink />
      </NavigationAudienceProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Trends' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Graph' })).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: 'Admin dashboard' }),
      ).toBeInTheDocument()
    })
    expect(screen.queryByRole('link', { name: 'Upload archive' })).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
