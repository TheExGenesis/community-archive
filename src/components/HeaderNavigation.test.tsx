/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import HeaderNavigation from './HeaderNavigation'

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

describe('HeaderNavigation', () => {
  it('renders muted navigation items with a darker tint', () => {
    render(
      <HeaderNavigation
        items={[{ href: '/social-graph', label: 'Graph', tone: 'muted' }]}
      />,
    )

    expect(screen.getByRole('link', { name: 'Graph' })).toHaveClass(
      'bg-muted/70',
      'text-muted-foreground',
    )
  })
})
