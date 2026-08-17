import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileHeader } from './ProfileHeader'
import { ProfileEditingProvider } from './ProfileEditingContext'
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
  expect(
    screen.queryByRole('img', { name: /archive|opted in/i }),
  ).not.toBeInTheDocument()
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

test('shows the opted-in icon without treating the user as a contributor', () => {
  render(
    <ProfileHeader
      profile={profile({ has_archive: false, is_opted_in: true })}
      archivedAt={null}
    />,
  )

  expect(screen.getByRole('img', { name: 'Opted in' })).toBeVisible()
  expect(screen.queryByText('Archive contributor')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Download archive' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('note', { name: 'Limited profile' }),
  ).not.toBeInTheDocument()
})

test('shows the archive icon without exposing another owner raw download', () => {
  render(
    <ProfileHeader
      profile={profile({ has_archive: true, is_opted_in: false })}
      archivedAt="2025-01-02T00:00:00.000Z"
    />,
  )

  expect(screen.getByRole('img', { name: 'Archive uploaded' })).toBeVisible()
  expect(screen.queryByText('Archive contributor')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Download archive' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('note', { name: 'Limited profile' }),
  ).not.toBeInTheDocument()
})

test('gives rostered contributors a distinct gold award badge', () => {
  render(
    <ProfileHeader
      profile={{
        ...profile({ has_archive: true, is_opted_in: false }),
        username: 'exgenesis',
      }}
      archivedAt={null}
    />,
  )

  expect(screen.getByText('Archive contributor')).toHaveClass(
    'border-yellow-500/40',
    'bg-yellow-500/10',
    'text-yellow-600',
  )
  expect(screen.getByRole('img', { name: 'Archive uploaded' })).toBeVisible()
  expect(screen.getByText('Archive contributor').parentElement).toHaveClass(
    'ml-2',
  )
})

test('puts the owner edit control immediately before the subtle X link', async () => {
  const user = userEvent.setup()
  render(
    <ProfileEditingProvider>
      <ProfileHeader
        profile={profile({ has_archive: true, is_opted_in: false })}
        archivedAt={null}
        isOwner
      />
    </ProfileEditingProvider>,
  )

  const editButton = screen.getByRole('button', { name: 'Edit profile' })
  const xLink = screen.getByRole('link', { name: 'View on X' })
  expect(
    screen.getByRole('link', { name: 'Download archive' }),
  ).toHaveAttribute('href', '/api/archive/alice')
  expect(editButton.nextElementSibling).toBe(xLink)
  expect(xLink).toHaveClass('bg-transparent', 'text-muted-foreground')

  await user.click(editButton)
  expect(screen.getByRole('button', { name: 'Done editing' })).toBeVisible()
})

test('honors an owner setting that hides the archive download', () => {
  render(
    <ProfileEditingProvider>
      <ProfileHeader
        profile={profile({ has_archive: true, is_opted_in: false })}
        archivedAt="2025-01-02T00:00:00.000Z"
        downloadArchiveVisible={false}
        isOwner
      />
    </ProfileEditingProvider>,
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

test('shows resolved, clickable profile bio and website links', () => {
  render(
    <ProfileHeader
      profile={{
        ...profile({ has_archive: true, is_opted_in: false }),
        bio: 'Building https://t.co/bio',
        website: 'https://t.co/site',
        profile_links: [
          {
            original_url: 'https://t.co/bio',
            expanded_url: 'https://www.community-archive.org/',
            display_url: 'community-archive.org',
          },
          {
            original_url: 'https://t.co/site',
            expanded_url: 'https://xiqo.substack.com/',
            display_url: 'xiqo.substack.com',
          },
        ],
      }}
      archivedAt={null}
    />,
  )

  expect(
    screen.getByRole('link', { name: 'community-archive.org' }),
  ).toHaveAttribute('href', 'https://www.community-archive.org/')
  expect(
    screen.getByRole('link', { name: 'xiqo.substack.com' }),
  ).toHaveAttribute('href', 'https://xiqo.substack.com/')
  expect(screen.queryByText('https://t.co/bio')).not.toBeInTheDocument()
  expect(screen.queryByText('https://t.co/site')).not.toBeInTheDocument()
})
