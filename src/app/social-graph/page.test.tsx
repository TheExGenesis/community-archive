/** @jest-environment jsdom */

import { requireAdmin } from '@/app/admin/data'
import { getSocialGraphSnapshot } from '@/lib/socialGraph'
import SocialGraphPage from './page'

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => () => null,
}))

jest.mock('@/app/admin/data', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/socialGraph', () => ({
  getSocialGraphSnapshot: jest.fn(),
}))

jest.mock('./SocialGraphAdminControls', () => ({
  SocialGraphAdminControls: () => null,
}))

const requireAdminMock = jest.mocked(requireAdmin)
const getSocialGraphSnapshotMock = jest.mocked(getSocialGraphSnapshot)

describe('SocialGraphPage access', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('enforces admin access before loading graph data', async () => {
    const denial = new Error('not authorized')
    requireAdminMock.mockRejectedValue(denial)

    await expect(SocialGraphPage()).rejects.toBe(denial)

    expect(requireAdminMock).toHaveBeenCalledWith('/social-graph')
    expect(getSocialGraphSnapshotMock).not.toHaveBeenCalled()
  })
})
