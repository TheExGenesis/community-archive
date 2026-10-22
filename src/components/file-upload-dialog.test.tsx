import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileUploadDialog } from './file-upload-dialog'
import {
  loadCollectionPreference,
  saveCollectionPreference,
} from '@/lib/collectionPreference'
import { uploadArchive } from '@/lib/upload-archive/uploadArchive'
import type { Archive } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/database-types'

jest.mock('@/lib/upload-archive/uploadArchive', () => ({
  uploadArchive: jest.fn(),
}))
jest.mock('@/lib/collectionPreference', () => ({
  collectionPreferenceAvailable: true,
  loadCollectionPreference: jest.fn(),
  saveCollectionPreference: jest.fn(),
}))
beforeEach(() => {
  jest.clearAllMocks()
  jest
    .mocked(loadCollectionPreference)
    .mockResolvedValue({ accountId: '42', enabled: true, uploadEnabled: false })
  jest.mocked(saveCollectionPreference).mockResolvedValue(undefined)
})
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))

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

test('shows one concise upload status while progress is active', async () => {
  jest
    .mocked(uploadArchive)
    .mockImplementation(
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

test('saves archive-only before starting the upload', async () => {
  const order: string[] = []
  jest.mocked(saveCollectionPreference).mockImplementation(async () => {
    order.push('preference')
  })
  jest.mocked(uploadArchive).mockImplementation(async () => {
    order.push('upload')
  })
  render(
    <FileUploadDialog
      supabase={{} as SupabaseClient<Database>}
      isOpen
      onClose={jest.fn()}
      archive={archive}
    />,
  )
  expect(
    await screen.findByLabelText('Collection after this upload'),
  ).toHaveValue('archive-only')
  await userEvent.click(screen.getByRole('button', { name: 'Upload' }))
  expect(saveCollectionPreference).toHaveBeenCalledWith('42', false)
  expect(order).toEqual(['preference', 'upload'])
})

test('does not upload when saving consent fails', async () => {
  jest
    .mocked(saveCollectionPreference)
    .mockRejectedValue(new Error('Could not save collection settings'))
  render(
    <FileUploadDialog
      supabase={{} as SupabaseClient<Database>}
      isOpen
      onClose={jest.fn()}
      archive={archive}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Upload' }))
  expect(
    await screen.findByText('Could not save collection settings'),
  ).toBeVisible()
  expect(uploadArchive).not.toHaveBeenCalled()
})

test('preserves the existing reupload choice and allows an affirmative change', async () => {
  jest
    .mocked(loadCollectionPreference)
    .mockResolvedValue({ accountId: '42', enabled: true, uploadEnabled: true })
  jest.mocked(uploadArchive).mockResolvedValue(undefined)
  render(
    <FileUploadDialog
      supabase={{} as SupabaseClient<Database>}
      isOpen
      onClose={jest.fn()}
      archive={archive}
    />,
  )
  const select = await screen.findByLabelText('Collection after this upload')
  await userEvent.selectOptions(select, 'archive-only')
  await userEvent.click(screen.getByRole('button', { name: 'Upload' }))
  expect(saveCollectionPreference).toHaveBeenCalledWith('42', false)
})
