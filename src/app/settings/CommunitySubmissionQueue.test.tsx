import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommunitySubmissionQueue } from './CommunitySubmissionQueue'
import { approveCommunityProject } from './communitySubmissionActions'
import type { CommunityProjectRow } from '@/lib/communityProjectDatabase'

jest.mock('./communitySubmissionActions', () => ({
  approveCommunityProject: jest.fn(),
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
      screen.getByText('Project approved and published to the gallery.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No Gallery submissions are waiting for approval.'),
    ).toBeInTheDocument()
  })
})
