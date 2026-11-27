/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { buildBackfillView } from '@/lib/backfillProgress'
import { captureProductAction } from '@/lib/productAnalytics'
import { account, snapshot } from '@/lib/backfillProgress.fixtures'
import { BackfillTable } from './BackfillTable'

jest.mock('@/lib/productAnalytics', () => ({ captureProductAction: jest.fn() }))

const monthly = {
  status: 'pending',
  planned: 10,
  done: 4,
  with_tweets: 3,
  failed: 1,
  pending: 5,
  oldest_reached: '2019-02-01',
  requests: 40,
  tweets_gained: 300,
}

function rows() {
  return buildBackfillView(
    snapshot([
      account('1', {
        username: 'alice',
        crawls: { ...account('1').crawls, monthly },
      }),
      account('2', { username: 'bob', profile_tweets: 100 }),
      account('3', { username: 'carol', rank: null }),
    ]),
    { generatedAt: 'x', counts: { '1': 250, '2': 95, '3': 900 } },
  ).rows
}

const bodyRows = () =>
  within(screen.getAllByRole('rowgroup')[1]).getAllByRole('row')
const names = () =>
  bodyRows().map((row) => within(row).getByRole('link').textContent)

test('lists members by priority with profile links and bars', () => {
  render(<BackfillTable rows={rows()} />)
  expect(names()).toEqual(['@alice', '@bob', '@carol'])
  expect(screen.getByRole('link', { name: '@alice' })).toHaveAttribute(
    'href',
    '/user/1',
  )
  expect(
    screen.getByRole('meter', { name: '25% complete' }),
  ).toBeInTheDocument()
  expect(bodyRows()[0]).toHaveTextContent(
    '4/10 months · 3 with tweets · 1 failed · back to 2019-02',
  )
  expect(screen.getByText('3 of 3 members')).toBeInTheDocument()
})

test('sorts by a column and toggles direction', () => {
  render(<BackfillTable rows={rows()} />)
  fireEvent.click(screen.getByRole('button', { name: /Completeness/ }))
  expect(names()).toEqual(['@alice', '@carol', '@bob'])
  fireEvent.click(screen.getByRole('button', { name: /Completeness/ }))
  expect(names()).toEqual(['@bob', '@carol', '@alice'])
  expect(captureProductAction).toHaveBeenCalledWith(
    'admin_backfill',
    'sort_changed',
  )
})

test('filters by text and status', () => {
  render(<BackfillTable rows={rows()} />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bo' } })
  expect(names()).toEqual(['@bob'])
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Under 50% complete' }))
  expect(names()).toEqual(['@alice'])
  expect(
    screen.getByRole('button', { name: 'Under 50% complete' }),
  ).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Monthly pending' }))
  expect(names()).toEqual(['@alice'])
  expect(captureProductAction).toHaveBeenCalledWith(
    'admin_backfill',
    'filter_changed',
  )
})
