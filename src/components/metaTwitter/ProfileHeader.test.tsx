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
  default: ({ fill, priority, alt = '', ...props }: MockImageProps) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}))

const profile = (
  membership: Pick<ProfileHeaderData, 'has_archive' | 'is_opted_in'>,
): ProfileHeaderData => ({
  account_id: '42',
  username: 'alice',
  account_display_name: 'Alice',
  created_at: '2010-01-01T00:00:00.000Z',
  num_tweets: 10,
  num_followers: 20,
  num_following: 30,
  num_likes: 40,
  bio: null,
  website: null,
  location: null,
  avatar_media_url: 'https://pbs.twimg.com/profile_images/42/avatar_normal.jpg',
  header_media_url: null,
  ...membership,
})

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://archive.supabase.co'
})

test('does not label a non-member or offer an archive download', () => {
  render(
    <ProfileHeader
      profile={profile({ has_archive: false, is_opted_in: false })}
      archivedAt={null}
    />,
  )

  expect(screen.queryByText('Archive contributor')).not.toBeInTheDocument()
  expect(screen.queryByText('Community member')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Download archive' }),
  ).not.toBeInTheDocument()
  const notice = screen.getByRole('note', { name: 'Limited profile' })
  expect(notice).toHaveTextContent(
    'This user is not a Community Archive user, so we only have a selection of their tweets - ones that Archive users interacted with. Is this your profile? You can sign in and opt out at any time.',
  )
  expect(notice.querySelector('svg')).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'sign in and opt out' }),
  ).toHaveAttribute('href', '/settings')
})

test('labels an opted-in non-uploader without offering a download', () => {
  render(
    <ProfileHeader
      profile={profile({ has_archive: false, is_opted_in: true })}
      archivedAt={null}
    />,
  )

  expect(screen.getByText('Community member')).toBeVisible()
  expect(screen.queryByText('Archive contributor')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Download archive' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('note', { name: 'Limited profile' }),
  ).not.toBeInTheDocument()
})

test('labels an uploader and exposes the archive download', () => {
  render(
    <ProfileHeader
      profile={profile({ has_archive: true, is_opted_in: false })}
      archivedAt="2025-01-02T00:00:00.000Z"
    />,
  )

  expect(screen.getByText('Archive contributor')).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Download archive' }),
  ).toHaveAttribute(
    'href',
    'https://archive.supabase.co/storage/v1/object/public/archives/alice/archive.json',
  )
  expect(
    screen.queryByRole('note', { name: 'Limited profile' }),
  ).not.toBeInTheDocument()
})

test('honors an owner setting that hides the archive download', () => {
  render(
    <ProfileHeader
      profile={profile({ has_archive: true, is_opted_in: false })}
      archivedAt="2025-01-02T00:00:00.000Z"
      downloadArchiveVisible={false}
    />,
  )

  expect(
    screen.queryByRole('link', { name: 'Download archive' }),
  ).not.toBeInTheDocument()
})

test('requests a high-resolution avatar for the profile header', () => {
  render(
    <ProfileHeader
      profile={profile({ has_archive: false, is_opted_in: false })}
      archivedAt={null}
    />,
  )

  expect(screen.getByAltText("Alice's avatar")).toHaveAttribute(
    'src',
    'https://pbs.twimg.com/profile_images/42/avatar_400x400.jpg',
  )
})
