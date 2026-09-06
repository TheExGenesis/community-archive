import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import UserPage from '@/app/user/[account_id]/page'
import { ProfileHeader } from '@/components/metaTwitter/ProfileHeader'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { getAuthenticatedAccountId } from '@/lib/authenticatedAccount'
import { getPublicProfileSettings } from '@/lib/profileCuration'

jest.mock('@/lib/metaTwitter/profile', () => ({
  resolveProfileCore: jest.fn(),
  withBackfilledMedia: jest.fn(),
}))
jest.mock('@/lib/authenticatedAccount', () => ({
  getAuthenticatedAccountId: jest.fn(),
}))
jest.mock('@/lib/profileCuration', () => ({
  getPublicProfileSettings: jest.fn(),
  getCuratedProfileBangersPage: jest.fn(),
}))

function findHeader(node: ReactNode): ReactElement | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined
  if (node.type === ProfileHeader) return node
  for (const child of Children.toArray(node.props.children)) {
    const result = findHeader(child)
    if (result) return result
  }
}

test('renders the profile before owner authentication and reads settings only for its owner', async () => {
  const profile = {
    account_id: '42',
    username: 'alice',
    account_display_name: 'Alice',
    has_archive: true,
    bio: 'Hello',
    avatar_media_url: null,
    header_media_url: null,
  }
  ;(resolveProfileCore as jest.Mock).mockResolvedValue({
    accountId: '42',
    profile,
  })
  const page = await UserPage({
    params: { account_id: 'alice' },
    searchParams: {},
  })
  expect(getAuthenticatedAccountId).not.toHaveBeenCalled()
  expect(getPublicProfileSettings).not.toHaveBeenCalled()
  const header = findHeader(page)!
  expect(header.props.profile).toBe(profile)
  const owner = header.props.ownerActionsSlot.props.children
  ;(getAuthenticatedAccountId as jest.Mock).mockResolvedValue(null)
  expect(await owner.type(owner.props)).toBeNull()
  expect(getPublicProfileSettings).not.toHaveBeenCalled()
  ;(getAuthenticatedAccountId as jest.Mock).mockResolvedValue('42')
  ;(getPublicProfileSettings as jest.Mock).mockResolvedValue({
    downloadArchiveVisible: false,
  })
  const actions = await owner.type(owner.props)
  expect(getPublicProfileSettings).toHaveBeenCalledWith('42')
  expect(actions.props.downloadArchiveVisible).toBe(false)
})
