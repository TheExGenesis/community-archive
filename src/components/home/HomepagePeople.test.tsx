import { render, screen } from '@testing-library/react'
import HomepagePeople from './HomepagePeople'
import { loadFavoritePeople } from '@/lib/favoritePeople'
import { sampleFeaturedArchives } from '@/lib/featuredArchives'
import { getCurrentUser } from '@/lib/portal/auth'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'

jest.mock('@/components/AvatarList', () => ({
  __esModule: true,
  default: ({
    initialAvatars,
  }: {
    initialAvatars: Array<{ username: string }>
  }) => (
    <div data-testid="homepage-avatars">
      {initialAvatars.map((avatar) => avatar.username).join(',')}
    </div>
  ),
}))
jest.mock('@/lib/favoritePeople', () => ({ loadFavoritePeople: jest.fn() }))
jest.mock('@/lib/featuredArchives', () => ({
  HOMEPAGE_FEATURED_ARCHIVE_COUNT: 8,
  sampleFeaturedArchives: jest.fn(),
}))
jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/lib/sessionTwitterUsername', () => ({
  getSessionTwitterUsername: jest.fn(),
}))

const loadFavoritePeopleMock = loadFavoritePeople as jest.MockedFunction<
  typeof loadFavoritePeople
>
const sampleFeaturedArchivesMock =
  sampleFeaturedArchives as jest.MockedFunction<typeof sampleFeaturedArchives>
const getCurrentUserMock = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>
const getSessionTwitterUsernameMock =
  getSessionTwitterUsername as jest.MockedFunction<
    typeof getSessionTwitterUsername
  >

const favoritePerson = (index: number) => ({
  accountId: String(100 + index),
  username: `friend${index}`,
  displayName: `Friend ${index}`,
  avatarUrl: `https://example.com/friend${index}.jpg`,
  interactionCount: 20 - index,
  mentionCount: 20 - index,
  replyCount: 0,
  quoteCount: 0,
  repostCount: 0,
})

beforeEach(() => {
  jest.clearAllMocks()
  sampleFeaturedArchivesMock.mockReturnValue([
    {
      account_id: '1',
      username: 'featured',
      avatar_media_url: 'https://example.com/featured.jpg',
    },
  ])
})

it('shows the eight cached interaction leaders to a signed-in member', async () => {
  getCurrentUserMock.mockResolvedValue({ id: 'user-1' } as never)
  getSessionTwitterUsernameMock.mockReturnValue('alice')
  loadFavoritePeopleMock.mockResolvedValue({
    people: Array.from({ length: 10 }, (_, index) => favoritePerson(index)),
    unavailable: false,
  })

  render(await HomepagePeople({ isMember: true }))

  expect(screen.getByText('People you interact with most')).toBeInTheDocument()
  expect(screen.getByTestId('homepage-avatars')).toHaveTextContent(
    Array.from({ length: 8 }, (_, index) => `friend${index}`).join(','),
  )
  expect(loadFavoritePeopleMock).toHaveBeenCalledWith('alice')
  expect(sampleFeaturedArchivesMock).not.toHaveBeenCalled()
})

it('shows the representative sample to guests', async () => {
  render(await HomepagePeople({ isMember: false }))

  expect(screen.getByText('Featured archives')).toBeInTheDocument()
  expect(screen.getByTestId('homepage-avatars')).toHaveTextContent('featured')
  expect(getCurrentUserMock).not.toHaveBeenCalled()
  expect(sampleFeaturedArchivesMock).toHaveBeenCalledTimes(1)
})

it('falls back to the representative sample when interaction data is absent', async () => {
  getCurrentUserMock.mockResolvedValue({ id: 'user-1' } as never)
  getSessionTwitterUsernameMock.mockReturnValue('alice')
  loadFavoritePeopleMock.mockResolvedValue({ people: [], unavailable: true })

  render(await HomepagePeople({ isMember: true }))

  expect(screen.getByText('Featured archives')).toBeInTheDocument()
  expect(screen.getByTestId('homepage-avatars')).toHaveTextContent('featured')
})
