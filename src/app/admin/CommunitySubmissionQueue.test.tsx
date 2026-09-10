import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommunitySubmissionQueue } from './CommunitySubmissionQueue'
import {
  approveCommunityProject,
  editCommunityProject,
  deleteCommunityProject,
} from './communitySubmissionActions'
import type { CommunityProjectRow } from '@/lib/communityProjectDatabase'

jest.mock('./communitySubmissionActions', () => ({
  approveCommunityProject: jest.fn(),
  editCommunityProject: jest.fn(),
  deleteCommunityProject: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}))

const mockApprove = approveCommunityProject as jest.MockedFunction<
  typeof approveCommunityProject
>

const pendingProject: CommunityProjectRow = {
  id: '8c21b2b5-3530-4ec8-9729-07635b28b692',
  slug: 'archive-quilt-8c21b2b5',
  name: 'Archive Quilt',
  project_url: 'https://example.org/archive-quilt',
  creator_name: 'Ada',
  creator_handle: 'ada',
  category: 'Experiments',
  description: 'A visual map of recurring conversations.',
  archive_use: 'It groups archive posts into conversation clusters.',
  source_post_url: 'https://x.com/ada/status/1234567890',
  tags: ['visualization'],
  cover_storage_path: null,
  cover_mime_type: null,
  submitter_username: 'ada',
  status: 'pending',
  featured: false,
  submitted_at: '2026-08-26T20:00:00.000Z',
  published_at: null,
}

// The shared Jest fetch polyfill replaces JSDOM FormData with undici's
// non-DOM constructor. Match browser form collection for this component test.
const FetchFormData = global.FormData
beforeEach(() => {
  jest.spyOn(window, 'FormData').mockImplementation((form) => {
    const data = new FetchFormData()
    if (form)
      Array.from(form.elements).forEach((element) => {
        if (
          (element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement) &&
          element.name
        )
          data.append(element.name, element.value)
      })
    return data
  })
})
afterEach(() => jest.restoreAllMocks())

describe('CommunitySubmissionQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('approves and removes a project from the pending queue', async () => {
    mockApprove.mockResolvedValue({
      ok: true,
      projectId: pendingProject.id,
    })
    const user = userEvent.setup()
    render(<CommunitySubmissionQueue initialProjects={[pendingProject]} />)

    expect(
      screen.getByRole('heading', { name: 'Archive Quilt' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Archive Quilt' }),
      ).not.toBeInTheDocument()
    })
    expect(
      screen.getByText('Project approved and published to Apps.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No App submissions are waiting for approval.'),
    ).toBeInTheDocument()
  })
})

it('requires confirmation to delete and retains the row when deletion fails', async () => {
  jest
    .mocked(deleteCommunityProject)
    .mockResolvedValue({ ok: false, error: 'Deletion failed' })
  const user = userEvent.setup()
  render(<CommunitySubmissionQueue initialProjects={[pendingProject]} />)
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(deleteCommunityProject).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Deletion failed')
  expect(
    screen.getByRole('heading', { name: 'Archive Quilt' }),
  ).toBeInTheDocument()
  jest
    .mocked(deleteCommunityProject)
    .mockResolvedValue({ ok: true, projectId: pendingProject.id })
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Submission deleted.',
  )
  expect(
    screen.queryByRole('heading', { name: 'Archive Quilt' }),
  ).not.toBeInTheDocument()
})

it('preserves edits on a network failure and allows retry', async () => {
  jest
    .mocked(editCommunityProject)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ok: true, projectId: pendingProject.id })
  const user = userEvent.setup()
  render(<CommunitySubmissionQueue initialProjects={[pendingProject]} />)
  await user.click(screen.getByRole('button', { name: 'Edit' }))
  await user.clear(screen.getByLabelText('App name'))
  await user.type(screen.getByLabelText('App name'), 'Updated Quilt')
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Please try again')
  expect(screen.getByLabelText('App name')).toHaveValue('Updated Quilt')
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Submission saved.',
  )
  expect(
    jest.mocked(editCommunityProject).mock.calls[1][0].get('projectName'),
  ).toBe('Updated Quilt')
})
