/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import HeaderNavigation from './HeaderNavigation'
import { capturePostHogEvent } from '@/lib/posthog'

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}))
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))

describe('HeaderNavigation', () => {
  it('renders Graph with the same styling as other navigation items', () => {
    render(
      <HeaderNavigation items={[{ href: '/social-graph', label: 'Graph' }]} />,
    )

    expect(screen.getByRole('link', { name: 'Graph' })).not.toHaveClass(
      'bg-muted/70',
      'text-muted-foreground',
    )
  })

  it('records the selected destination without sending its label or URL', () => {
    render(
      <HeaderNavigation
        items={[{ href: '/bangers?period=week', label: 'Bangers' }]}
      />,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Bangers' }))

    expect(capturePostHogEvent).toHaveBeenCalledWith(
      'navigation_item_clicked',
      {
        destination: 'bangers',
        surface: 'desktop',
        already_active: false,
      },
    )
  })
})
