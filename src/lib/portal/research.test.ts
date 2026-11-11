jest.mock('server-only', () => ({}), { virtual: true })

import {
  getResearchPosts,
  pinResearchPost,
  selectFeaturedResearchPosts,
} from './research'
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
    post('The Switchboard Operator Benchmark'),
    post('epistemic garden recap | lab notes #1'),
    post(
      'discovering the postrat canon in the community archive | lab notes #4',
    ),
    post('opportunity mining | lab notes #6'),
    post('a theory of tpot (postrat twitter)'),
    post('Agentic Taste Modeling | lab notes #8'),
    {
      ...post('Why do I care about twitter so much?'),
      url: 'https://xiqo.substack.com/p/why-do-i-care-about-twitter-so-much',
    },
  ])

  expect(selected.map(({ title }) => title)).toEqual([
    'Why do I care about twitter so much?',
    'The Switchboard Operator Benchmark',
    'Agentic Taste Modeling | lab notes #8',
    'a theory of tpot (postrat twitter)',
  ])
})

test('shows the featured research posts and hides the phoenix post', async () => {
  const item = (title: string, url: string) => `
    <item>
      <title><![CDATA[${title}]]></title>
      <link>${url}</link>
      <pubDate>Sun, 23 Aug 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[Excerpt]]></description>
    </item>`
  const xml = `<rss><channel>
    ${item(
      'The Switchboard Operator Benchmark',
      'https://xiqo.substack.com/p/the-switchboard-operator-benchmark',
    )}
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
    'https://xiqo.substack.com/p/the-switchboard-operator-benchmark',
    'https://xiqo.substack.com/p/why-do-i-care-about-twitter-so-much',
  ])
  fetchSpy.mockRestore()
})

test('keeps the pinned article when it is absent from the feed', () => {
  const posts = pinResearchPost([post('Another research project')])
  expect(posts.map(({ title }) => title)).toEqual([
    'Why do I care about twitter so much?',
    'Another research project',
  ])
  expect(selectFeaturedResearchPosts([])).toEqual([posts[0]])
})

test('pins by URL after a title change and keeps fresh metadata without duplicates', () => {
  const article = {
    ...post('A new title'),
    url: 'https://xiqo.substack.com/p/why-do-i-care-about-twitter-so-much',
    excerpt: 'Updated excerpt',
  }
  const other = post('Another research project')
  expect(pinResearchPost([other, article, article])).toEqual([article, other])
  expect(selectFeaturedResearchPosts([other, article])).toEqual([article])
})
