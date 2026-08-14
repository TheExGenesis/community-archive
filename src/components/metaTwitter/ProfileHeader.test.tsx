import { render, screen } from '@testing-library/react'
import { ProfileHeader } from './ProfileHeader'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt = '', ...props }: { alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}))

jest.mock('./ProfileAvatar', () => ({
  ProfileAvatar: () => <div data-testid="profile-avatar" />,
}))

const profile = (
  membership: Pick<ProfileHeaderData, 'has_archive' | 'is_opted_in'>,
): ProfileHeaderData => ({
  account_id: '42',
  username: 'alice',
  account_display_name: 'Alice',
  created_at: null,
  num_tweets: 10,
  num_followers: 20,
  num_following: 30,
  num_likes: 40,
  bio: null,
  website: null,
  location: null,
  avatar_media_url: null,
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
})
