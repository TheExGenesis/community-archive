import { render, screen } from '@testing-library/react'
import { RecentPrivacyActivity } from './RecentPrivacyActivity'
import type { RecentPrivacyActivity as RecentPrivacyActivityData } from './activity'

const activity: RecentPrivacyActivityData = {
  archiveDeletes: [
    {
      id: 'job:123',
      accountId: '42',
      username: 'alice',
      source: 'Admin worker',
      status: 'queued',
      activityAt: '2026-07-18T14:00:00Z',
      requestedAt: '2026-07-18T14:00:00Z',
      detail: 'Delete job 12345678',
      reason: 'Requested by account owner',
      error: null,
    },
    {
      id: 'action:9',
      accountId: '84',
      username: null,
      source: 'Self-service log',
      status: 'recorded',
      activityAt: '2026-07-18T13:00:00Z',
      requestedAt: '2026-07-18T13:00:00Z',
      detail: 'Deleted all archive data',
      reason: null,
      error: null,
    },
  ],
  optOuts: [
    {
      id: 'optout:1',
      accountId: '42',
      username: 'alice',
      occurredAt: '2026-07-18T12:00:00Z',
      reason: 'Privacy request',
    },
  ],
  warning: null,
}

describe('RecentPrivacyActivity', () => {
  it('shows recent delete states and explicit opt-outs', () => {
    render(<RecentPrivacyActivity activity={activity} />)

    expect(screen.getByText('Archive deletes')).toBeInTheDocument()
    expect(screen.getByText('Queued')).toBeInTheDocument()
    expect(screen.getByText('Logged')).toBeInTheDocument()
    expect(screen.getAllByText('@alice')).toHaveLength(2)
    expect(screen.getByText('Privacy request')).toBeInTheDocument()
  })
})
