import React from 'react'
import { render, screen } from '@testing-library/react'
import ClassicHomepage from './ClassicHomepage'
import type { PortalData } from '@/lib/portal/types'
import { createServerClient } from '@/utils/supabase'
import { getLatestDigestPreview } from '@/lib/digest/data'

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
jest.mock('@/components/home/Testimonials', () => ({
  __esModule: true,
  default: () => <div data-testid="testimonials" />,
}))
jest.mock('@/components/portal/Portal', () => ({
  __esModule: true,
  default: () => <div data-testid="shared-dashboard" />,
}))
jest.mock('@/components/ExtensionInstallPrompt', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/lib/digest/data', () => ({
  getLatestDigestPreview: jest.fn(),
}))
jest.mock('@/utils/supabase', () => ({ createServerClient: jest.fn() }))

const data = {
  stats: {
    totalTweets: 14_000_000,
    accountCount: 700,
    tweetCountDeltaLast24Hours: 0,
    joinedThisWeek: 0,
    firstYear: 2006,
    currentYear: 2026,
    generatedAt: '2026-08-12T00:00:00.000Z',
  },
  trends: { years: [], series: [], weekly: [], computedAt: '' },
  initialStream: [],
  research: [],
  recentBangers: [],
  historicalBangers: [],
  failures: {
    liveAnalytics: false,
    memberCount: false,
    joinedThisWeek: false,
    corpusRange: false,
    trends: false,
    initialStream: false,
    research: false,
    recentBangers: false,
    historicalBangers: false,
  },
} satisfies PortalData

describe('ClassicHomepage audience actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getLatestDigestPreview as jest.Mock).mockResolvedValue(null)
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
    expect(screen.getByTestId('homepage-people')).toBeInTheDocument()
    expect(screen.getByTestId('shared-dashboard')).toBeInTheDocument()
  })

  it('states the totals plainly, with no counter to animate them', async () => {
    render(
      await ClassicHomepage({
        data,
        homepagePeople: <div data-testid="homepage-people" />,
        isMember: false,
        showCta: true,
      }),
    )

    expect(screen.getByText(/14\.0M public tweets/)).toBeInTheDocument()
    expect(screen.getByText(/700 community members/)).toBeInTheDocument()
  })
})
