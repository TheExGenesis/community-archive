import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WeeklyDigestContent } from './weekly'
import { renderWeeklyDigestEmail } from './weeklyEmailTemplate'

const content = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'memos/artifacts/20261108-weekly-digest-v7/2026-10-26.json',
    ),
    'utf8',
  ),
) as WeeklyDigestContent

const edition = {
  id: 'week',
  weekStart: content.weekStart,
  publishedAt: null,
  content,
}
const links = {
  siteUrl: 'https://www.community-archive.org',
  unsubscribeUrl:
    'https://www.community-archive.org/api/digest/email/unsubscribe?token=t&list=weekly',
}

test('renders the week like the week page, with a weekly-only unsubscribe', () => {
  const email = renderWeeklyDigestEmail(edition, links)
  expect(email.subject).toBe(
    'The Week in Review — 26 October – 1 November 2026',
  )
  for (const story of content.stories) {
    expect(email.text).toContain(
      `https://www.community-archive.org/digest/week/2026-10-26/${story.slug}`,
    )
    for (const id of story.featuredTweetIds) {
      expect(email.html).toContain(`/tweets/${id}`)
    }
  }
  const quoted = content.stories.find((story) => story.titleIsQuote)!
  expect(email.text).toContain(`“${quoted.title.replace(/[*_`]/g, '')}”`)
  expect(email.html).toContain(links.unsubscribeUrl)
  expect(email.html).toContain('Unsubscribe from the weekly email')
  expect(email.text).toContain(
    'Manage emails: https://www.community-archive.org/settings',
  )
})
