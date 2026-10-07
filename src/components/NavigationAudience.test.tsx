/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import {
  AdminNavigationLink,
  NavigationAudienceProvider,
} from './NavigationAudience'

describe('NavigationAudience', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise(() => {}))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('hides the admin link before checking the session', () => {
    render(
      <NavigationAudienceProvider>
        <AdminNavigationLink />
      </NavigationAudienceProvider>,
    )

    expect(screen.queryByRole('link', { name: 'Admin dashboard' })).toBeNull()
  })

  it('adds the admin link after session hydration', async () => {
    jest.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ isMember: true, isAdmin: true }),
    } as Response)

    render(
      <NavigationAudienceProvider>
        <AdminNavigationLink />
      </NavigationAudienceProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'Admin dashboard' }),
      ).toBeInTheDocument()
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
