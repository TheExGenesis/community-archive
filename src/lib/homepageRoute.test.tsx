import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Homepage from '@/app/page'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalData } from '@/lib/portal/data'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/components/home/ClassicHomepage', () => ({
  __esModule: true,
  default: () => <div>classic homepage</div>,
}))
jest.mock('@/components/portal/Portal', () => ({
  __esModule: true,
  default: () => <div>member portal</div>,
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

    expect(renderToStaticMarkup(page)).toContain('classic homepage')
    expect(getIsMemberMock).not.toHaveBeenCalled()
    expect(getPortalDataMock).not.toHaveBeenCalled()
  })

  it('renders the portal normally after the pending action is cleared', async () => {
    const page = await Homepage({ searchParams: {} })

    expect(renderToStaticMarkup(page)).toContain('member portal')
    expect(getIsMemberMock).toHaveBeenCalledTimes(1)
    expect(getPortalDataMock).toHaveBeenCalledTimes(1)
  })
})
