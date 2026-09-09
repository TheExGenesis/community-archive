import { fireEvent, render, screen } from '@testing-library/react'
import { OpportunityBoard } from './OpportunityBoard'
import type { Opportunity } from '@/lib/bulletin/types'
const offer = {
  tweet_id: '1',
  account_id: 'a',
  username: 'alice',
  posted_at: '2026-09-08T00:00:00Z',
  full_text: 'Happy to help with Python.',
  side: 'offer',
  kind: 'help',
  summary: 'Help with Python',
  evidence: 'Happy to help',
  topics: ['python'],
  respond: 'dm',
  standing: false,
  expires_at: null,
  place: null,
  model: 'test',
} as unknown as Opportunity
const ask = {
  ...offer,
  tweet_id: '2',
  side: 'ask',
  kind: 'feedback',
  summary: 'Feedback on a garden',
  topics: ['gardening'],
}
test('combines side, category and search filters, then resets them', () => {
  render(<OpportunityBoard opportunities={[offer, ask]} />)
  expect(screen.getByRole('status')).toHaveTextContent('2 of 2 notices')
  fireEvent.click(screen.getByRole('button', { name: 'Asks' }))
  expect(screen.queryByText('Help with Python')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Category'), {
    target: { value: 'help' },
  })
  expect(screen.getByText('No matching notices')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  fireEvent.change(screen.getByLabelText('Search opportunities'), {
    target: { value: 'python' },
  })
  expect(screen.getByRole('status')).toHaveTextContent('1 of 2 notices')
  expect(
    screen.getByRole('link', { name: /View original post/ }),
  ).toHaveAttribute(
    'href',
    expect.stringContaining('/tweets/1?from=opportunities'),
  )
})
test('empty state is different from a search with no matches', () => {
  render(<OpportunityBoard opportunities={[]} />)
  expect(screen.getByText('No opportunities yet')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Clear filters' }),
  ).not.toBeInTheDocument()
})
