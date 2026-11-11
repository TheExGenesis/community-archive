import type { PortalTweet } from '@/lib/portal/types'
import {
  BODY_FONT,
  HEADING_FONT,
  escapeHtml,
  renderTweetCard,
  tweetToText,
  type DigestEmailLinks,
  type RenderedDigestEmail,
} from './emailTemplate'
import type { WeeklyDigestStory } from './weekly'
import type { WeeklyDigestEdition } from './weeklyData'

const plain = (markdown: string) => markdown.replace(/[*_`]/g, '')

const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )

/** "26 October – 1 November 2026", as on the week page. */
export const weeklyEmailRange = (start: string, end: string) =>
  `${dateLabel(start, { day: 'numeric', month: 'long' })} – ${dateLabel(end, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`

const storyTitle = (story: WeeklyDigestStory) =>
  story.titleIsQuote ? `“${plain(story.title)}”` : plain(story.title)

/** The tweets the week page features with a story, in the same order. */
const featured = (story: WeeklyDigestStory): PortalTweet[] => {
  const byId = new Map(story.tweets.map((tweet) => [tweet.id, tweet]))
  const chosen = story.featuredTweetIds.flatMap((id) => {
    const tweet = byId.get(id)
    return tweet ? [tweet] : []
  })
  return chosen.length > 0 ? chosen : story.tweets.slice(0, 2)
}

const continuity = (story: WeeklyDigestStory) =>
  story.continuesFrom.length > 0
    ? `Continues from the week of ${story.continuesFrom
        .map((ref) =>
          dateLabel(ref.weekStart, { day: 'numeric', month: 'long' }),
        )
        .join(' and ')}`
    : ''

/** The Week in Review email: dek, then each story as on the week page. */
export function renderWeeklyDigestEmail(
  edition: WeeklyDigestEdition,
  links: DigestEmailLinks,
): RenderedDigestEmail {
  const { content } = edition
  const range = weeklyEmailRange(content.weekStart, content.weekEnd)
  const weekUrl = `${links.siteUrl}/digest/week/${edition.weekStart}`
  const storyUrl = (story: WeeklyDigestStory) =>
    `${weekUrl}/${encodeURIComponent(story.slug)}`
  const subject = `The Week in Review — ${range}`

  const storiesHtml = content.stories
    .map((story, index) => {
      const note = continuity(story)
      return `
      <table role="presentation" width="100%" style="margin:28px 0 20px;">
        <tr><td>
          <h2 style="margin:0 0 6px;font-family:${HEADING_FONT};font-size:25px;line-height:1.25;">
            <span style="display:inline-block;min-width:30px;font-family:${BODY_FONT};font-size:15px;font-weight:700;color:#9ca3af;">${index + 1}</span><a href="${escapeHtml(storyUrl(story))}" style="color:#111827;text-decoration:none;">${escapeHtml(storyTitle(story))}</a>
          </h2>
          <p style="margin:0 0 ${note ? '4px' : '12px'};color:#374151;font-size:15px;line-height:1.55;">${escapeHtml(plain(story.subtitle))}</p>
          ${note ? `<p style="margin:0 0 12px;color:#6b7280;font-size:12.5px;">${escapeHtml(note)}</p>` : ''}
          ${featured(story)
            .map((tweet) => renderTweetCard(tweet, links.siteUrl))
            .join('')}
          <p style="margin:0;font-size:13px;"><a href="${escapeHtml(storyUrl(story))}" style="color:#1d4ed8;">Read the story →</a></p>
        </td></tr>
      </table>`
    })
    .join('')

  const html = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Petrona:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;700&display=swap');
    @media (max-width: 480px) { .weekly-h1 { font-size: 26px !important; } }
  </style>
  <div style="margin:0 auto;max-width:600px;padding:24px;font-family:${BODY_FONT};color:#111827;">
    <a href="${escapeHtml(links.siteUrl)}" style="display:inline-block;" aria-label="Community Archive website"><img src="${links.siteUrl}/images/email-logo.png" width="48" height="48" alt="Community Archive" style="display:block;margin:0 0 12px;" /></a>
    <p style="margin:0 0 4px;font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;">Community Archive · The Week in Review</p>
    <h1 class="weekly-h1" style="margin:0 0 10px;font-family:${HEADING_FONT};font-size:30px;line-height:1.2;color:#111827;">${escapeHtml(range)}</h1>
    ${content.dek ? `<p style="margin:0 0 14px;font-family:${HEADING_FONT};font-size:19px;font-style:italic;line-height:1.4;color:#374151;">${escapeHtml(content.dek)}</p>` : ''}
    <p style="margin:0 0 8px;"><a href="${escapeHtml(weekUrl)}" style="color:#1d4ed8;font-size:14px;">Read on Community Archive →</a></p>
    ${storiesHtml}
    <p style="margin:0 0 32px;"><a href="${escapeHtml(weekUrl)}" style="color:#1d4ed8;font-size:14px;">Read the whole week →</a></p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;" />
    <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
      You are receiving this because you subscribed to the Community Archive Week in Review.<br />
      <a href="${links.unsubscribeUrl}" style="color:#6b7280;">Unsubscribe from the weekly email</a> · <a href="${escapeHtml(links.siteUrl)}/settings" style="color:#6b7280;">Manage emails</a>
    </p>
  </div>`

  const text = [
    `The Week in Review — ${range}`,
    ...(content.dek ? [content.dek] : []),
    `Read on Community Archive: ${weekUrl}`,
    '',
    ...content.stories.flatMap((story, index) => [
      `${index + 1}. ${storyTitle(story)}`,
      storyUrl(story),
      plain(story.subtitle),
      ...(continuity(story) ? [continuity(story)] : []),
      ...featured(story).flatMap((tweet) => ['', tweetToText(tweet)]),
      '',
    ]),
    `Read the whole week: ${weekUrl}`,
    '',
    `Unsubscribe from the weekly email: ${links.unsubscribeUrl}`,
    `Manage emails: ${links.siteUrl}/settings`,
  ].join('\n')

  return { subject, html, text }
}
