import React from 'react'
import { render, screen } from '@testing-library/react'
import ClassicHomepage from './ClassicHomepage'
import type { HomepageData } from '@/lib/portal/data'
import { createServerClient } from '@/utils/supabase'

jest.mock('./hero/StoryColumn', () => ({
  __esModule: true,
  default: () => <div>Stories</div>,
}))
jest.mock('./hero/HexMap', () => ({
  __esModule: true,
  default: ({
    stories,
    actions,
  }: {
    stories: React.ReactNode
    actions: React.ReactNode
  }) => (
    <div data-testid="hex-map">
      {stories}
      {actions}
    </div>
  ),
}))

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
  overview: pending,
  stream: pending,
  recentBangers: pending,
  historicalBangers: pending,
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
        isMember: true,
        showCta: false,
      }),
    )

    expect(screen.getByTestId('homepage-search')).toBeInTheDocument()
    expect(screen.queryByTestId('hero-cta')).not.toBeInTheDocument()
    expect(screen.getByTestId('hex-map')).toBeInTheDocument()
    expect(screen.getByTestId('shared-dashboard')).toBeInTheDocument()
  })

  it('shows search and keeps guest actions within the map sidebar', async () => {
    render(
      await ClassicHomepage({
        data,
        isMember: false,
        showCta: true,
      }),
    )

    expect(screen.getByTestId('hero-cta')).toBeInTheDocument()
    expect(screen.getByTestId('homepage-search')).toBeInTheDocument()
    expect(screen.getByTestId('hex-map')).toBeInTheDocument()
    expect(screen.getByTestId('shared-dashboard')).toBeInTheDocument()
  })
})
