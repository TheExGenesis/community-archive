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
  it('renders Home, the digest, Explore, Community, Tools, then Research', () => {
    render(<HeaderNavigation entries={getPrimaryNav()} label="Main" />)

    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(
      Array.from(nav.querySelectorAll('ul > li > :is(button, a)')).map(
        (el) => el.textContent,
      ),
    ).toEqual([
      'Home',
      "Today's Digest",
      'Explore archive',
      'Community',
      'Tools',
      'Research',
    ])
    expect(
      screen.getByRole('link', { name: "Today's Digest" }),
    ).toHaveAttribute('href', '/digest')
  })

  it('marks the menu holding the current page as active', () => {
    render(<HeaderNavigation entries={getPrimaryNav()} label="Main" />)

    expect(screen.getByRole('button', { name: 'Tools' })).toHaveClass(
      'text-brand',
    )
    expect(
      screen.getByRole('button', { name: 'Explore archive' }),
    ).not.toHaveClass('bg-brand/10')
  })

  it('opens a menu with titled, described items and tracks the destination', () => {
    render(<HeaderNavigation entries={getPrimaryNav()} label="Main" />)

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }))
    const library = screen.getByRole('link', { name: /CA Library/ })
    expect(library).toHaveTextContent(
      'Essays, books, films and papers the community keeps citing.',
    )
    expect(screen.getByRole('link', { name: /More tools/ })).toHaveAttribute(
      'href',
      '/more-tools',
    )
    expect(screen.queryByRole('link', { name: /^Strands/ })).toBeNull()

    fireEvent.click(library)
    expect(capturePostHogEvent).toHaveBeenCalledWith(
      'navigation_item_clicked',
      {
        destination: 'library',
        surface: 'desktop',
        already_active: false,
      },
    )
  })
})
