jest.mock('server-only', () => ({}), { virtual: true })

import { getResearchPosts, selectFeaturedResearchPosts } from './research'
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
    post('Towards a Pattern Language of Serendipity Online'),
  ])

  expect(selected.map(({ title }) => title)).toEqual([
    'Towards a Pattern Language of Serendipity Online',
    'Agentic Taste Modeling | lab notes #8',
    'a theory of tpot (postrat twitter)',
    'opportunity mining | lab notes #6',
  ])
})

test('shows the serendipity post and hides the phoenix post', async () => {
  const item = (title: string, url: string) => `
    <item>
      <title><![CDATA[${title}]]></title>
      <link>${url}</link>
      <pubDate>Sun, 23 Aug 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[Excerpt]]></description>
    </item>`
  const xml = `<rss><channel>
    ${item(
      'Towards a Pattern Language of Serendipity Online',
      'https://xiqo.substack.com/p/why-do-i-care-about-twitter-so-much',
    )}
    ${item(
      'New on the Community Archive: User Pages, Bangers, Daily Digest',
      'https://xiqo.substack.com/p/the-community-archive-rises-from',
    )}
  </channel></rss>`
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    text: jest.fn().mockResolvedValue(xml),
  } as unknown as Response)

  const posts = await getResearchPosts(24)

  expect(posts.map(({ url }) => url)).toEqual([
    'https://xiqo.substack.com/p/why-do-i-care-about-twitter-so-much',
  ])
  fetchSpy.mockRestore()
})
