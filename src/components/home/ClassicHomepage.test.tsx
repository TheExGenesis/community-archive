import React from 'react'
import { render, screen } from '@testing-library/react'
import ClassicHomepage from './ClassicHomepage'
import type { HomepageData } from '@/lib/portal/data'
import { createServerClient } from '@/utils/supabase'

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
