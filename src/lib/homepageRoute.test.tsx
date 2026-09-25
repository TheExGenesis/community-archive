import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Homepage, { dynamic as homepageRenderingMode } from '@/app/page'
import { getIsMember } from '@/lib/portal/auth'
import { startHomepageData, startMemberHomepageData } from '@/lib/portal/data'

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
jest.mock('@/components/home/MemberHomepage', () => ({
  __esModule: true,
  default: ({ user }: { user: { id: string } | null }) => (
    <div>member home · user {user?.id ?? 'none'}</div>
  ),
}))
jest.mock('@/lib/portal/auth', () => ({
  getIsMember: jest.fn(),
  getCurrentUser: jest.fn(async () => ({ id: 'user-1' })),
}))
jest.mock('@/lib/portal/data', () => ({
  startHomepageData: jest.fn(),
  startMemberHomepageData: jest.fn(() => ({})),
}))
jest.mock('@/components/home/HomepagePeople', () => ({
  __esModule: true,
  default: () => <div>homepage people</div>,
}))

const getIsMemberMock = getIsMember as jest.MockedFunction<typeof getIsMember>
const startHomepageDataMock = startHomepageData as jest.MockedFunction<
  typeof startHomepageData
>

describe('Homepage OAuth actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getIsMemberMock.mockResolvedValue(true)
    startHomepageDataMock.mockReturnValue(
      {} as Awaited<ReturnType<typeof startHomepageData>>,
    )
  })

  it('renders at request time so portal fallback data is not frozen at build time', () => {
    expect(homepageRenderingMode).toBe('force-dynamic')
  })

  it('returns the homepage shell without waiting for portal analytics', async () => {
    getIsMemberMock.mockResolvedValue(false)
    startHomepageDataMock.mockReturnValue({
      globalStats: new Promise(() => undefined),
    } as ReturnType<typeof startHomepageData>)

    const page = await Homepage({ searchParams: {} })
    const markup = renderToStaticMarkup(page)

    expect(markup).toContain('homepage people')
    expect(startHomepageDataMock).toHaveBeenCalledTimes(1)
  })

  it('keeps an authenticated OAuth return on the opt-in completion surface', async () => {
    const page = await Homepage({ searchParams: { action: 'optin' } })

    const markup = renderToStaticMarkup(page)
    expect(markup).toContain('shared homepage · member true · CTA true')
    expect(markup).toContain('homepage people')
    expect(getIsMemberMock).toHaveBeenCalledTimes(1)
    expect(startHomepageDataMock).toHaveBeenCalledTimes(1)
  })

  it('gives signed-in members their own home instead of the pitch', async () => {
    const page = await Homepage({ searchParams: {} })

    const markup = renderToStaticMarkup(page)
    expect(markup).toContain('member home · user user-1')
    expect(markup).not.toContain('homepage people')
    expect(startMemberHomepageData).toHaveBeenCalledTimes(1)
    expect(startHomepageDataMock).not.toHaveBeenCalled()
  })

  it('renders the shared dashboard with the CTA for logged-out visitors', async () => {
    getIsMemberMock.mockResolvedValue(false)
    const page = await Homepage({ searchParams: {} })

    const markup = renderToStaticMarkup(page)
    expect(markup).toContain('shared homepage · member false · CTA true')
    expect(markup).toContain('homepage people')
  })
})
