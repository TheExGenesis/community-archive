import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { ProfileHeader } from './ProfileHeader'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'

type MockImageProps = React.ComponentProps<'img'> & {
  fill?: boolean
  priority?: boolean
}

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    fill,
    priority,
    alt = '',
    ...props
  }: MockImageProps) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}))

const profile: ProfileHeaderData = {
  account_id: '42',
  username: 'alice',
  account_display_name: 'Alice',
  created_at: '2010-01-01T00:00:00.000Z',
  bio: null,
  website: null,
  location: null,
  avatar_media_url: 'https://pbs.twimg.com/profile_images/42/avatar_normal.jpg',
  header_media_url: null,
  num_tweets: 100,
  num_followers: 200,
  num_following: 50,
  num_likes: 300,
  has_archive: false,
}

test('requests a high-resolution avatar for the profile header', () => {
  render(<ProfileHeader profile={profile} archivedAt={null} />)

  expect(screen.getByAltText("Alice's avatar")).toHaveAttribute(
    'src',
    'https://pbs.twimg.com/profile_images/42/avatar_400x400.jpg',
  )
})
