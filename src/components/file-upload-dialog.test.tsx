import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileUploadDialog } from './file-upload-dialog'
import { uploadArchive } from '@/lib/upload-archive/uploadArchive'
import type { Archive } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/database-types'

jest.mock('@/lib/upload-archive/uploadArchive', () => ({
  uploadArchive: jest.fn(),
}))
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))

const mockedUploadArchive = jest.mocked(uploadArchive)

const archive: Archive = {
  profile: [
    {
      profile: {
        description: { bio: '', website: '', location: '' },
        avatarMediaUrl: '',
        headerMediaUrl: '',
      },
    },
  ],
  account: [
    {
      account: {
        createdVia: 'web',
        username: 'alice',
        accountId: '42',
        createdAt: '2020-01-01T00:00:00.000Z',
        accountDisplayName: 'Alice',
      },
    },
  ],
  tweets: [
    {
      tweet: {
        id: '1',
        id_str: '1',
        source: 'web',
        entities: {},
        favorite_count: 0,
        retweet_count: 0,
        created_at: '2026-08-01T00:00:00.000Z',
        favorited: false,
        full_text: 'Hello',
      },
    },
  ],
  follower: [],
  following: [],
  'community-tweet': [],
  like: [],
}

beforeEach(() => {
  mockedUploadArchive.mockReset()
})

test('shows one concise upload status while progress is active', async () => {
  mockedUploadArchive.mockImplementation(
    (
      _supabase,
      onProgress: (progress: { phase: string; percent: number }) => void,
    ) => {
      onProgress({ phase: 'Uploading archive to storage', percent: 0 })
      return new Promise(() => {})
    },
  )
  const user = userEvent.setup()

  render(
    <FileUploadDialog
      supabase={{} as SupabaseClient<Database>}
      isOpen
      onClose={jest.fn()}
      archive={archive}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Upload' }))

  expect(
    screen.getByRole('heading', { name: 'Upload in progress' }),
  ).toBeVisible()
  expect(
    await screen.findByText('Uploading archive to storage: 0.00%'),
  ).toBeVisible()
  expect(screen.getAllByText(/uploading/i)).toHaveLength(1)
})

test('suggests recovery steps when an upload fails', async () => {
  mockedUploadArchive.mockRejectedValue(
    new Error('new row violates row-level security policy'),
  )
  const user = userEvent.setup()

  render(
    <FileUploadDialog
      supabase={{} as SupabaseClient<Database>}
      isOpen
      onClose={jest.fn()}
      archive={archive}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'Upload' }))

  expect(
    await screen.findByRole('heading', { name: 'Upload Error' }),
  ).toBeVisible()
  expect(
    screen.getByText('new row violates row-level security policy'),
  ).toBeVisible()
  expect(screen.getByText(/try signing out and back in/i)).toBeVisible()
  expect(screen.getByText(/try a different browser/i)).toBeVisible()
})
