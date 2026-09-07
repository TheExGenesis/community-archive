import { render, screen } from '@testing-library/react'
import { RecentArchiveUploads } from './RecentArchiveUploads'

test('shows separate upload records from the same existing account', () => {
  const base = {
    account_id: '42',
    username: 'alice',
    archive_at: '2026-08-01T00:00:00Z',
    upload_phase: 'completed' as const,
  }
  render(
    <RecentArchiveUploads
      failed={false}
      uploads={[
        { ...base, id: 102, created_at: '2026-09-07T10:00:00Z' },
        { ...base, id: 101, created_at: '2026-09-06T10:00:00Z' },
      ]}
    />,
  )
  expect(screen.getAllByRole('link', { name: '@alice' })).toHaveLength(2)
  expect(screen.getByText('#102')).toBeVisible()
  expect(screen.getByText('#101')).toBeVisible()
  expect(screen.getByText('2026-09-07 10:00 UTC')).toBeVisible()
})

test('distinguishes an unavailable upload list from an empty one', () => {
  render(<RecentArchiveUploads failed uploads={[]} />)
  expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded')
  expect(screen.queryByText('No archive uploads yet.')).not.toBeInTheDocument()
})
