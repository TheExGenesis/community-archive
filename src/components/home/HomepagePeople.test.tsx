import { render, screen } from '@testing-library/react'
import HomepagePeople from './HomepagePeople'
import { sampleFeaturedArchives } from '@/lib/featuredArchives'
import { loadHomepageArchiveProfiles } from '@/lib/homepageArchiveProfiles'

jest.mock('@/components/AvatarList', () => ({
  __esModule: true,
  default: ({
    initialAvatars,
  }: {
    initialAvatars: Array<{ username: string; num_tweets?: number }>
  }) => (
    <div data-testid="homepage-avatars">
      {initialAvatars
        .map((avatar) => `${avatar.username}:${avatar.num_tweets ?? 'none'}`)
        .join(',')}
    </div>
  ),
}))
jest.mock('@/lib/featuredArchives', () => ({
  HOMEPAGE_FEATURED_ARCHIVE_COUNT: 8,
  sampleFeaturedArchives: jest.fn(),
}))
jest.mock('@/lib/homepageArchiveProfiles', () => ({
  loadHomepageArchiveProfiles: jest.fn(),
}))

const sampleFeaturedArchivesMock =
  sampleFeaturedArchives as jest.MockedFunction<typeof sampleFeaturedArchives>
const loadHomepageArchiveProfilesMock =
  loadHomepageArchiveProfiles as jest.MockedFunction<
    typeof loadHomepageArchiveProfiles
  >

beforeEach(() => {
  jest.clearAllMocks()
  sampleFeaturedArchivesMock.mockReturnValue([
    {
      account_id: '1',
      username: 'featured',
      avatar_media_url: 'https://example.com/featured.jpg',
    },
  ])
  loadHomepageArchiveProfilesMock.mockImplementation(async (archives) =>
    archives.map((archive, index) => ({
      ...archive,
      num_tweets: 1_000 + index,
    })),
  )
})

it('shows the representative sample', async () => {
  render(await HomepagePeople())

  expect(screen.getByTestId('homepage-avatars')).toHaveTextContent(
    'featured:1000',
  )
  expect(sampleFeaturedArchivesMock).toHaveBeenCalledTimes(1)
})

it('falls back to the raw sample when profile loading returns nothing', async () => {
  loadHomepageArchiveProfilesMock.mockResolvedValue([])

  render(await HomepagePeople())

  expect(screen.getByTestId('homepage-avatars')).toHaveTextContent(
    'featured:none',
  )
})
