jest.mock('server-only', () => ({}), { virtual: true })

import { selectFeaturedResearchPosts } from './research'
import type { ResearchPost } from './types'

function post(title: string): ResearchPost {
  return {
    title,
    url: `https://example.com/${encodeURIComponent(title)}`,
    date: '2026-08-07T00:00:00.000Z',
    excerpt: '',
    image: null,
    author: null,
  }
}

test('selects the four featured research posts in editorial order', () => {
  const selected = selectFeaturedResearchPosts([
    post('epistemic garden recap | lab notes #1'),
    post(
      'discovering the postrat canon in the community archive | lab notes #4',
    ),
    post('opportunity mining | lab notes #6'),
    post('a theory of tpot (postrat twitter)'),
    post('Agentic Taste Modeling | lab notes #8'),
  ])

  expect(selected.map(({ title }) => title)).toEqual([
    'Agentic Taste Modeling | lab notes #8',
    'a theory of tpot (postrat twitter)',
    'opportunity mining | lab notes #6',
    'discovering the postrat canon in the community archive | lab notes #4',
  ])
})
