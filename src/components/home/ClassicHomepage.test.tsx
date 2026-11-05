import React from 'react'
import { render, screen } from '@testing-library/react'
import ClassicHomepage from './ClassicHomepage'
import type { HomepageData } from '@/lib/portal/data'
import { createServerClient } from '@/utils/supabase'

jest.mock('./ExploreArchivePill', () => ({
  __esModule: true,
  default: () => <a href="#community-map">Explore the archive ↓</a>,
}))

jest.mock('./classicHomepage.module.css', () => ({}))

jest.mock('next/headers', () => ({ cookies: jest.fn(() => ({})) }))
jest.mock('next/dynamic', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react')
  let dynamicIndex = 0
  return {
    __esModule: true,
    default: () => {
      const testId = dynamicIndex++ === 0 ? 'hero-cta' : 'archive-upload'
      return function DynamicStub() {
        return mockReact.createElement('div', { 'data-testid': testId })
      }
    },
  }
})
jest.mock('./hero/HexHero', () => ({
  __esModule: true,
  default: () => (
    <section data-testid="hex-hero">
      <a href="#daily-digest">Continue to digest</a>
    </section>
  ),
}))
jest.mock('@/components/HomepageSearch', () => ({
  __esModule: true,
  default: () => <div data-testid="homepage-search" />,
}))
jest.mock('./FeaturedCommunityApps', () => ({
  __esModule: true,
  default: () => <div data-testid="featured-community-apps" />,
}))
jest.mock('@/components/home/Testimonials', () => ({
  __esModule: true,
  default: () => <div data-testid="testimonials" />,
}))
jest.mock('@/components/home/HomepageDataSections', () => ({
  HomepageStats: () => <>14.0M public tweets from 700 community members.</>,
  HomepagePortal: () => <div data-testid="shared-dashboard" />,
  HomepagePortalFallback: () => <div data-testid="dashboard-fallback" />,
}))
jest.mock('@/components/ExtensionInstallPrompt', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/utils/supabase', () => ({ createServerClient: jest.fn() }))

const pending = new Promise<never>(() => undefined)
const data: HomepageData = {
  globalStats: pending,
  trends: pending,
  research: pending,
}
jest.mock('./HomepageUpload', () => ({
  __esModule: true,
  default: () => <div data-testid="archive-upload" />,
}))

describe('ClassicHomepage audience actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(createServerClient as jest.Mock).mockReturnValue({})
  })

  it('keeps search above the shared dashboard for signed-in members', async () => {
    render(
      await ClassicHomepage({
        data,
        homepagePeople: <div data-testid="homepage-people" />,
        isMember: true,
        showCta: false,
      }),
    )

    expect(screen.getByTestId('homepage-search')).toBeInTheDocument()
    expect(screen.queryByTestId('hero-cta')).not.toBeInTheDocument()
    expect(screen.getByTestId('homepage-people')).toBeInTheDocument()
    expect(screen.getByTestId('shared-dashboard')).toBeInTheDocument()
    const sections = [
      screen.getByRole('heading', { name: 'Community Archive' }),
      screen.getByTestId('homepage-search'),
      screen.getByTestId('homepage-people'),
      screen.getByTestId('hex-hero'),
      screen.getByTestId('shared-dashboard'),
      screen.getByTestId('featured-community-apps'),
      screen.getByTestId('archive-upload'),
      screen.getByTestId('testimonials'),
    ]
    sections.slice(1).forEach((section, index) => {
      expect(
        sections[index].compareDocumentPosition(section) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })
  })

  it('keeps the CTA above the same dashboard for guests', async () => {
    render(
      await ClassicHomepage({
        data,
        homepagePeople: <div data-testid="homepage-people" />,
        isMember: false,
        showCta: true,
      }),
    )

    expect(screen.getByTestId('hero-cta')).toBeInTheDocument()
    expect(screen.queryByTestId('homepage-search')).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Explore the archive ↓' }),
    ).toHaveAttribute('href', '#community-map')
    expect(screen.getByTestId('homepage-people')).toBeInTheDocument()
    expect(screen.getByTestId('shared-dashboard')).toBeInTheDocument()
  })
})
