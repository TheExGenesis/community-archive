/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import {
  getTwitterProviderId,
  getTwitterUsername,
  isAdminUser,
} from '@/app/admin/data'
import { getCurrentUser } from '@/lib/portal/auth'
import { getSocialGraphSnapshot } from '@/lib/socialGraph'
import SocialGraphPage from './page'

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => () => null,
}))

jest.mock('@/app/admin/data', () => ({
  getTwitterProviderId: jest.fn(),
  getTwitterUsername: jest.fn(),
  isAdminUser: jest.fn(),
}))

jest.mock('@/lib/portal/auth', () => ({
  getCurrentUser: jest.fn(),
}))

jest.mock('@/lib/socialGraph', () => ({
  getSocialGraphSnapshot: jest.fn(),
}))

jest.mock('./SocialGraphAdminControls', () => ({
  SocialGraphAdminControls: () => <div>Refresh graph</div>,
}))

const getCurrentUserMock = jest.mocked(getCurrentUser)
const getSocialGraphSnapshotMock = jest.mocked(getSocialGraphSnapshot)
const isAdminUserMock = jest.mocked(isAdminUser)
const getTwitterProviderIdMock = jest.mocked(getTwitterProviderId)
const getTwitterUsernameMock = jest.mocked(getTwitterUsername)

describe('SocialGraphPage public access', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getSocialGraphSnapshotMock.mockResolvedValue({
      generatedAt: '2026-08-28T00:00:00.000Z',
    } as never)
  })

  it('loads the graph for an anonymous visitor without admin controls', async () => {
    getCurrentUserMock.mockResolvedValue(null)

    render(await SocialGraphPage())

    expect(getSocialGraphSnapshotMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Mutual interaction map')).toBeInTheDocument()
    expect(screen.queryByText('Refresh graph')).toBeNull()
    expect(isAdminUserMock).not.toHaveBeenCalled()
  })

  it('keeps refresh controls available to admins', async () => {
    const user = { id: 'admin' } as never
    getCurrentUserMock.mockResolvedValue(user)
    isAdminUserMock.mockReturnValue(true)
    getTwitterProviderIdMock.mockReturnValue('123')
    getTwitterUsernameMock.mockReturnValue('admin')

    render(await SocialGraphPage())

    expect(screen.getByText('Refresh graph')).toBeInTheDocument()
    expect(isAdminUserMock).toHaveBeenCalledWith(user)
  })
})
