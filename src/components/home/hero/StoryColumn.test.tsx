import { render, screen } from '@testing-library/react'
import { getStrands } from '@/lib/community-apps/data'
import { StrandStories } from './StoryColumn'

jest.mock('@/lib/community-apps/data', () => ({ getStrands: jest.fn() }))
jest.mock('@/lib/community-apps/strand-tweets', () => ({
  getStrandTweets: jest.fn(),
}))
jest.mock('@/lib/digest/data', () => ({ getLatestDigestPreview: jest.fn() }))
jest.mock('@/lib/performance/server', () => ({
  measureServerRead: (_name: string, read: () => Promise<unknown>) => read(),
}))
jest.mock('@/components/PagePerformance', () => ({ SectionReady: () => null }))

it('shows the top six strands from the consent-checked loader in rating order', async () => {
  ;(getStrands as jest.Mock).mockResolvedValue({
    strands: Array.from({ length: 7 }, (_, i) => ({
      id: String(i),
      title: `Thread ${i}`,
      rating: i,
      summary: 'A long conversation',
      username: 'alice',
      text: '',
      participants: [],
      essentialTweets: [],
      createdAt: '',
    })),
  })
  render(await StrandStories())
  const links = screen
    .getAllByRole('link')
    .filter((link) => /\/strands\/\d/.test(link.getAttribute('href') ?? ''))
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/strands/6',
    '/strands/5',
    '/strands/4',
    '/strands/3',
    '/strands/2',
    '/strands/1',
  ])
  expect(screen.queryByText('Thread 0')).toBeNull()
})

it('shows an unavailable state when the strand read or consent check fails', async () => {
  ;(getStrands as jest.Mock).mockRejectedValue(
    new Error('Consent check failed'),
  )
  render(await StrandStories())
  expect(screen.getByText('Strands are temporarily unavailable.')).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Explore all strands ↗' }),
  ).toHaveAttribute('href', '/strands')
})
