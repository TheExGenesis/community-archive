import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Homepage from '@/app/page'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalData } from '@/lib/portal/data'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/components/home/ClassicHomepage', () => ({
  __esModule: true,
  default: ({ isMember, showCta }: { isMember: boolean; showCta: boolean }) => (
    <div>
      shared homepage · member {String(isMember)} · CTA {String(showCta)}
    </div>
  ),
}))
jest.mock('@/lib/portal/auth', () => ({ getIsMember: jest.fn() }))
jest.mock('@/lib/portal/data', () => ({ getPortalData: jest.fn() }))

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

  it('keeps an authenticated OAuth return on the opt-in completion surface', async () => {
    const page = await Homepage({ searchParams: { action: 'optin' } })

    expect(renderToStaticMarkup(page)).toContain(
      'shared homepage · member true · CTA true',
    )
    expect(getIsMemberMock).toHaveBeenCalledTimes(1)
    expect(getPortalDataMock).toHaveBeenCalledTimes(1)
  })

  it('renders the same dashboard without the CTA for signed-in visitors', async () => {
    const page = await Homepage({ searchParams: {} })

    expect(renderToStaticMarkup(page)).toContain(
      'shared homepage · member true · CTA false',
    )
    expect(getIsMemberMock).toHaveBeenCalledTimes(1)
    expect(getPortalDataMock).toHaveBeenCalledTimes(1)
  })

  it('renders the shared dashboard with the CTA for logged-out visitors', async () => {
    getIsMemberMock.mockResolvedValue(false)
    const page = await Homepage({ searchParams: {} })

    expect(renderToStaticMarkup(page)).toContain(
      'shared homepage · member false · CTA true',
    )
  })
})
