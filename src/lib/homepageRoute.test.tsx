import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Homepage, { dynamic as homepageRenderingMode } from '@/app/page'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalData } from '@/lib/portal/data'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/components/home/ClassicHomepage', () => ({
  __esModule: true,
  default: ({
    homepagePeople,
    isMember,
    showCta,
  }: {
    homepagePeople: React.ReactNode
    isMember: boolean
    showCta: boolean
  }) => (
    <div>
      shared homepage · member {String(isMember)} · CTA {String(showCta)}
      {homepagePeople}
    </div>
  ),
}))
jest.mock('@/lib/portal/auth', () => ({ getIsMember: jest.fn() }))
jest.mock('@/lib/portal/data', () => ({ getPortalData: jest.fn() }))
jest.mock('@/components/home/HomepagePeople', () => ({
  __esModule: true,
  default: ({ isMember }: { isMember: boolean }) => (
    <div>homepage people · member {String(isMember)}</div>
  ),
  HomepagePeopleFallback: () => <div>homepage people fallback</div>,
}))

const getIsMemberMock = getIsMember as jest.MockedFunction<typeof getIsMember>
const getPortalDataMock = getPortalData as jest.MockedFunction<
  typeof getPortalData
>

describe('Homepage OAuth actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getIsMemberMock.mockResolvedValue(true)
    getPortalDataMock.mockResolvedValue(
      {} as Awaited<ReturnType<typeof getPortalData>>,
    )
  })

  it('renders at request time so portal fallback data is not frozen at build time', () => {
    expect(homepageRenderingMode).toBe('force-dynamic')
  })

  it('keeps an authenticated OAuth return on the opt-in completion surface', async () => {
    const page = await Homepage({ searchParams: { action: 'optin' } })

    const markup = renderToStaticMarkup(page)
    expect(markup).toContain('shared homepage · member true · CTA true')
    expect(markup).toContain('homepage people · member true')
    expect(getIsMemberMock).toHaveBeenCalledTimes(1)
    expect(getPortalDataMock).toHaveBeenCalledTimes(1)
  })

  it('renders the same dashboard without the CTA for signed-in visitors', async () => {
    const page = await Homepage({ searchParams: {} })

    const markup = renderToStaticMarkup(page)
    expect(markup).toContain('shared homepage · member true · CTA false')
    expect(markup).toContain('homepage people · member true')
    expect(getIsMemberMock).toHaveBeenCalledTimes(1)
    expect(getPortalDataMock).toHaveBeenCalledTimes(1)
  })

  it('renders the shared dashboard with the CTA for logged-out visitors', async () => {
    getIsMemberMock.mockResolvedValue(false)
    const page = await Homepage({ searchParams: {} })

    const markup = renderToStaticMarkup(page)
    expect(markup).toContain('shared homepage · member false · CTA true')
    expect(markup).toContain('homepage people · member false')
  })
})
