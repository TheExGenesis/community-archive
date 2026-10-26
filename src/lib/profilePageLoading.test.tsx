jest.mock('@/lib/browsingAuth', () => ({ getBrowsingUser: jest.fn() }))
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import { getBrowsingUser } from '@/lib/browsingAuth'
import UserPage, { generateMetadata } from '@/app/user/[account_id]/page'
import { ProfileHeader } from '@/components/metaTwitter/ProfileHeader'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { getAuthenticatedAccountId } from '@/lib/authenticatedAccount'
import {
  getPublicProfileSettings,
  getCuratedProfileBangersPage,
} from '@/lib/profileCuration'
import GuestProfile from '@/components/metaTwitter/GuestProfile'
import { withBackfilledMedia } from '@/lib/metaTwitter/profile'
import { renderToStaticMarkup } from 'react-dom/server'

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
// The guest prompt reads the requested chapter in the browser so the cached
// preview itself never depends on the query string.
jest.mock('next/navigation', () => ({
  ...jest.requireActual('next/navigation'),
  useSearchParams: () => new URLSearchParams('chapter=2025&section=hello'),
}))

function findHeader(node: ReactNode): ReactElement | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined
  if (node.type === ProfileHeader) return node
  for (const child of Children.toArray(node.props.children)) {
    const result = findHeader(child)
    if (result) return result
  }
}

const profile = {
  account_id: '42',
  username: 'alice',
  account_display_name: 'Alice',
  has_archive: true,
  bio: 'Hello',
  avatar_media_url: null,
  header_media_url: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getBrowsingUser as jest.Mock).mockResolvedValue({ id: 'viewer' })
  ;(resolveProfileCore as jest.Mock).mockResolvedValue({
    accountId: '42',
    profile,
  })
})

test('renders the profile before owner authentication and reads settings only for its owner', async () => {
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

test('shows only basic identity and a destination-preserving login prompt to guests', async () => {
  ;(getBrowsingUser as jest.Mock).mockResolvedValue(null)
  const page = await UserPage({
    params: { account_id: 'alice' },
    searchParams: { chapter: '2025', section: 'hello' },
  })
  expect(page.type).toBe(GuestProfile)
  expect(page.props).toEqual({
    displayName: 'Alice',
    username: 'alice',
    bio: 'Hello',
    avatarUrl: null,
    basePath: '/user/alice',
  })
  const html = renderToStaticMarkup(page)
  expect(html).toContain('Log in to explore this profile')
  expect(html).toContain(
    '/login?redirect=%2Fuser%2Falice%3Fchapter%3D2025%26section%3Dhello',
  )
  expect(findHeader(page)).toBeUndefined()
  expect(getCuratedProfileBangersPage).not.toHaveBeenCalled()
  expect(withBackfilledMedia).not.toHaveBeenCalled()
  expect(getAuthenticatedAccountId).not.toHaveBeenCalled()
  expect(getPublicProfileSettings).not.toHaveBeenCalled()
})

test('provides basic, noindex profile metadata for the guest preview', async () => {
  ;(getBrowsingUser as jest.Mock).mockResolvedValue(null)
  const metadata = await generateMetadata({
    params: { account_id: 'alice' },
    searchParams: {},
  })
  expect(metadata.title).toContain('Alice (@alice)')
  expect(metadata.robots).toEqual({ index: false })
})
