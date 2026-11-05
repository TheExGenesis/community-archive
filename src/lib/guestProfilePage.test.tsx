import { notFound, redirect } from 'next/navigation'
import GuestProfilePage, {
  generateMetadata,
} from '@/app/guest/user/[account_id]/page'
import GuestProfile from '@/components/metaTwitter/GuestProfile'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'

jest.mock('@/lib/metaTwitter/profile', () => ({
  resolveProfileCore: jest.fn(),
}))
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: jest.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`)
  }),
}))

const resolved = {
  accountId: '42',
  isMember: true,
  profile: {
    account_id: '42',
    username: 'Alice',
    account_display_name: 'Alice Example',
    bio: 'Hello',
    avatar_media_url: 'https://pbs.twimg.com/a.jpg',
    header_media_url: null,
  },
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(resolveProfileCore as jest.Mock).mockResolvedValue(resolved)
})

test('renders the guest preview for the canonical handle without reading the request', async () => {
  const page = await GuestProfilePage({
    params: Promise.resolve({ account_id: 'Alice' }),
  })
  expect(page.type).toBe(GuestProfile)
  expect(page.props).toEqual({
    displayName: 'Alice Example',
    username: 'Alice',
    bio: 'Hello',
    avatarUrl: 'https://pbs.twimg.com/a.jpg',
    basePath: '/user/Alice',
  })
  expect(redirect).not.toHaveBeenCalled()
})

test('sends other spellings to the public canonical profile URL', async () => {
  await expect(
    GuestProfilePage({ params: Promise.resolve({ account_id: 'alice' }) }),
  ).rejects.toThrow('NEXT_REDIRECT:/user/Alice')
})

test('an unknown account is a 404', async () => {
  ;(resolveProfileCore as jest.Mock).mockResolvedValue(null)
  await expect(
    GuestProfilePage({ params: Promise.resolve({ account_id: 'nobody' }) }),
  ).rejects.toThrow('NEXT_NOT_FOUND')
  expect(notFound).toHaveBeenCalled()
})

test('shares the noindex profile metadata', async () => {
  const metadata = await generateMetadata({
    params: Promise.resolve({ account_id: 'Alice' }),
  })
  expect(metadata.title).toContain('Alice Example (@Alice)')
  expect(metadata.robots).toEqual({ index: false })
  expect(metadata.alternates?.canonical).toBe('/user/Alice')
})
