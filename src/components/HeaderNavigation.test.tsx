/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import HeaderNavigation from './HeaderNavigation'
import { getPrimaryNav } from '@/lib/navigation'
import { capturePostHogEvent } from '@/lib/posthog'

jest.mock('next/navigation', () => ({
  usePathname: () => '/trends',
}))
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))

describe('HeaderNavigation', () => {
  it('renders Home, the digest, the three menus, then Research, in order', () => {
    render(<HeaderNavigation entries={getPrimaryNav()} label="Main" />)

    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(
      Array.from(nav.querySelectorAll('ul > li > :is(button, a)')).map(
        (el) => el.textContent,
      ),
    ).toEqual([
      'Home',
      "Today's Digest",
      'Ideas',
      'Explore archive',
      'Community',
      'Research',
    ])
    expect(
      screen.getByRole('link', { name: "Today's Digest" }),
    ).toHaveAttribute('href', '/digest')
  })

  it('marks the menu holding the current page as active', () => {
    render(<HeaderNavigation entries={getPrimaryNav()} label="Main" />)

    expect(screen.getByRole('button', { name: 'Explore archive' })).toHaveClass(
      'text-brand',
    )
    expect(screen.getByRole('button', { name: 'Ideas' })).not.toHaveClass(
      'bg-brand/10',
    )
  })

  it('opens a menu with titled, described items and tracks the destination', () => {
    render(<HeaderNavigation entries={getPrimaryNav()} label="Main" />)

    fireEvent.click(screen.getByRole('button', { name: 'Ideas' }))
    const bangers = screen.getByRole('link', { name: /Bangers/ })
    expect(bangers).toHaveTextContent('The best tweets of all time.')
    expect(screen.getByRole('link', { name: /Strands/ })).toHaveAttribute(
      'href',
      '/strands',
    )

    fireEvent.click(bangers)
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
