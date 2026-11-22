import { renderSearchAlertEmail } from './emailTemplate'

const tweet = (id: string, text: string) => ({
  id,
  username: 'someone',
  name: 'Some <One>',
  avatar: null,
  text,
  createdAt: '2026-11-20T00:00:00Z',
  observedAt: '2026-11-20T00:00:00Z',
  likes: 3,
  rts: 1,
})

const links = {
  siteUrl: 'https://www.community-archive.org',
  unsubscribeUrl:
    'https://www.community-archive.org/api/search-alerts/email/unsubscribe?token=t',
  settingsUrl: 'https://www.community-archive.org/settings#search-alerts',
}

test('renders each alert with its count, a few tweets and a dated search link', () => {
  const rendered = renderSearchAlertEmail(
    [
      {
        query: 'community archive',
        fromUser: null,
        count: 7,
        since: '2026-11-19T15:00:00.000Z',
        tweets: [1, 2, 3, 4].map((i) => tweet(String(i), `post ${i} <b>`)),
      },
    ],
    links,
  )
  expect(rendered.subject).toBe('7 new matches for “community archive”')
  expect(rendered.html).toContain(
    'https://www.community-archive.org/search?q=community+archive&amp;sinceDate=2026-11-19',
  )
  expect(rendered.html).toContain('See all 7 matches in the archive')
  expect(rendered.html).toContain('post 3 &lt;b&gt;')
  expect(rendered.html).not.toContain('post 4')
  expect(rendered.html).toContain('Some &lt;One&gt;')
  expect(rendered.html).toContain('Turn off alert emails')
  expect(rendered.text).toContain(links.unsubscribeUrl)
})
