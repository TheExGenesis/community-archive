import { render, screen } from '@testing-library/react'
import HomepagePeople from './HomepagePeople'
import { sampleFeaturedArchives } from '@/lib/featuredArchives'

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

const sampleFeaturedArchivesMock =
  sampleFeaturedArchives as jest.MockedFunction<typeof sampleFeaturedArchives>
beforeEach(() => {
  jest.clearAllMocks()
  sampleFeaturedArchivesMock.mockReturnValue([
    {
      account_id: '1',
      username: 'featured',
      avatar_media_url: 'https://example.com/featured.jpg',
      num_tweets: 1_000,
    },
  ])
})

it('shows the representative sample without profile loading', () => {
  render(<HomepagePeople />)

  expect(screen.getByTestId('homepage-avatars')).toHaveTextContent(
    'featured:1000',
  )
  expect(sampleFeaturedArchivesMock).toHaveBeenCalledTimes(1)
})
