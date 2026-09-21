import { render, screen, within } from '@testing-library/react'
import { RunDashboard } from './RunDashboard'
import type { BulletinRun } from '@/lib/bulletin/types'

jest.mock('./RefreshButton', () => ({ RefreshButton: () => null }))

test('shows additions separately from rechecks without inventing legacy counts', () => {
  const run: BulletinRun = {
    id: '37',
    started_at: '2026-09-21T06:33:00Z',
    finished_at: '2026-09-21T06:37:00Z',
    status: 'ok',
    counts: { positive: 5, new_notices: 2, existing_notices: 3 },
    model: 'test',
    classifier_version: 'test',
    actual_usd: 0,
    unpriced_reserved_usd: 0,
  }
  render(
    <RunDashboard
      data={{
        last_success_at: run.finished_at,
        queue: { pending: 0, retrying: 0, exhausted: 0 },
        runs: [
          run,
          {
            ...run,
            id: '36',
            counts: { positive: 0, new_notices: 0, existing_notices: 0 },
          },
          { ...run, id: '35', counts: { positive: 5 } },
        ],
      }}
    />,
  )
  const rows = within(screen.getByRole('table')).getAllByRole('row')
  const headings = within(rows[0]).getAllByRole('columnheader')
  const newIndex = headings.findIndex(
    (cell) => cell.textContent === 'New notices',
  )
  const existingIndex = headings.findIndex(
    (cell) => cell.textContent === 'Existing notices',
  )
  expect(newIndex).toBeGreaterThan(0)
  expect(existingIndex).toBeGreaterThan(0)
  for (const [index, added, existing] of [
    [1, '2', '3'],
    [2, '0', '0'],
    [3, '—', '—'],
  ] as const) {
    const cells = within(rows[index]).getAllByRole('cell')
    expect(cells[newIndex]).toHaveTextContent(added)
    expect(cells[existingIndex]).toHaveTextContent(existing)
  }
  expect(
    within(rows[3]).getByText('Total positive decisions:').nextElementSibling,
  ).toHaveTextContent('5')
})
