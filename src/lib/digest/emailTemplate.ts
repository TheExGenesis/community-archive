import type { DigestEdition } from '@/lib/digest/types'
import type { PortalTweet } from '@/lib/portal/types'
import { formatNumber } from '@/lib/formatNumber'

export interface DigestEmailLinks {
  siteUrl: string
  unsubscribeUrl: string
}

export interface RenderedDigestEmail {
  subject: string
  html: string
  text: string
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Gmail clips messages over ~102KB, so the email shows a bounded sample of
// tweets and links to the site for the rest.
const BANGERS_PER_STORY = 2

const escapeTweetText = (value: string) =>
  escapeHtml(value).replace(/\r?\n/g, '<br />')

const firstPhoto = (tweet: PortalTweet) =>
  (tweet.media ?? []).find((media) =>
    ['photo', 'image'].includes(media.type.toLowerCase()),
  )

const renderQuotedTweet = (tweet: NonNullable<PortalTweet['quotedTweet']>) => `
  <div style="margin:10px 0 0;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;">
    <p style="margin:0 0 4px;font-size:13px;color:#111827;"><strong>${escapeHtml(tweet.name)}</strong> <span style="color:#6b7280;">@${escapeHtml(tweet.username)}</span></p>
    <p style="margin:0;font-size:13px;line-height:1.45;color:#374151;">${escapeTweetText(tweet.text)}</p>
  </div>`

const renderTweetCard = (tweet: PortalTweet, siteUrl: string) => {
  const tweetUrl = `${siteUrl}/tweets/${encodeURIComponent(tweet.id)}`
  const photo = firstPhoto(tweet)
  const avatarHtml = tweet.avatar
    ? `<img src="${escapeHtml(tweet.avatar)}" width="36" height="36" alt="" style="border-radius:18px;display:block;" />`
    : `<div style="width:36px;height:36px;border-radius:18px;background:#e5e7eb;"></div>`
  const rtsHtml =
    tweet.retweetCountAvailable === false
      ? ''
      : ` &nbsp;·&nbsp; 🔁 ${escapeHtml(formatNumber(tweet.rts))}`
  return `
  <table role="presentation" width="100%" style="margin:0 0 12px;border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate;">
    <tr><td style="padding:12px 14px;">
      <table role="presentation"><tr>
        <td style="vertical-align:top;padding-right:10px;">${avatarHtml}</td>
        <td style="vertical-align:middle;">
          <p style="margin:0;font-size:14px;color:#111827;"><strong>${escapeHtml(tweet.name)}</strong></p>
          <p style="margin:0;font-size:13px;color:#6b7280;">@${escapeHtml(tweet.username)}</p>
        </td>
      </tr></table>
      <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#111827;">${escapeTweetText(tweet.text)}</p>
      ${photo ? `<img src="${escapeHtml(photo.url)}" alt="" style="margin:10px 0 0;max-width:100%;border-radius:8px;display:block;" />` : ''}
      ${tweet.quotedTweet ? renderQuotedTweet(tweet.quotedTweet) : ''}
      <p style="margin:10px 0 0;font-size:12px;color:#6b7280;">♥ ${escapeHtml(formatNumber(tweet.likes))}${rtsHtml} &nbsp;·&nbsp; <a href="${tweetUrl}" style="color:#1d4ed8;text-decoration:none;">View in the archive</a></p>
    </td></tr>
  </table>`
}

const tweetToText = (tweet: PortalTweet) =>
  [
    `${tweet.name} (@${tweet.username}):`,
    tweet.text,
    ...(tweet.quotedTweet
      ? [`> ${tweet.quotedTweet.name} (@${tweet.quotedTweet.username}): ${tweet.quotedTweet.text}`]
      : []),
  ].join('\n')

// Gmail strips webfont imports, so both stacks lean on solid fallbacks:
// Petrona degrades to Georgia, Manrope to the system sans stack.
const HEADING_FONT = `Petrona, Georgia, 'Times New Roman', serif`
const BODY_FONT = `Manrope, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`

// "Tuesday, August 11" + ", 2026"; the year is hidden on narrow screens so
// the headline stays on one line.
const formatDigestDateParts = (digestDate: string) => {
  const date = new Date(`${digestDate}T00:00:00Z`)
  const dayPart = date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const year = date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
  })
  return { dayPart, year, full: `${dayPart}, ${year}` }
}

export function renderDigestEmail(
  edition: DigestEdition,
  links: DigestEmailLinks,
): RenderedDigestEmail {
  const { content } = edition
  const prettyDate = formatDigestDateParts(edition.digestDate)
  const editionUrl = `${links.siteUrl}/digest/${edition.digestDate}`
  const subject = `Community Archive Digest — ${prettyDate.full}`

  const summaryHtml = content.executiveSummary
    .map((line) => `<li style="margin:0 0 6px;">${escapeHtml(line)}</li>`)
    .join('')

  const storiesHtml = content.stories
    .map(
      (story) => `
      <table role="presentation" width="100%" style="margin:24px 0 20px;">
        <tr><td>
          <h2 style="margin:0 0 4px;font-family:${HEADING_FONT};font-size:26px;line-height:1.3;">
            <a href="${editionUrl}#${escapeHtml(story.slug)}" style="color:#111827;text-decoration:none;">${escapeHtml(story.title)}</a>
          </h2>
          <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.5;">${escapeHtml(story.subtitle)}</p>
          <ul style="margin:0 0 10px;padding-left:20px;color:#374151;font-size:14px;line-height:1.5;">
            ${story.bullets.map((bullet) => `<li style="margin:0 0 4px;">${escapeHtml(bullet)}</li>`).join('')}
          </ul>
          ${story.bangers
            .slice(0, BANGERS_PER_STORY)
            .map((tweet) => renderTweetCard(tweet, links.siteUrl))
            .join('')}
          ${
            story.bangers.length > BANGERS_PER_STORY
              ? `<p style="margin:0;font-size:13px;"><a href="${editionUrl}#${escapeHtml(story.slug)}" style="color:#1d4ed8;">+ ${story.bangers.length - BANGERS_PER_STORY} more tweet${story.bangers.length - BANGERS_PER_STORY === 1 ? '' : 's'} in this story →</a></p>`
              : ''
          }
        </td></tr>
      </table>`,
    )
    .join('')

  const topBangerHtml = `
    <p style="margin:0 0 8px;font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;">Top tweet</p>
    ${renderTweetCard(content.topBanger, links.siteUrl)}`

  const html = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Petrona:wght@500;600&family=Manrope:wght@400;500;700&display=swap');
    @media (max-width: 480px) {
      .digest-h1 { font-size: 27px !important; }
      .digest-year { display: none !important; }
    }
  </style>
  <div style="margin:0 auto;max-width:600px;padding:24px;font-family:${BODY_FONT};color:#111827;">
    <img src="${links.siteUrl}/images/email-logo.png" width="48" height="48" alt="Community Archive" style="display:block;margin:0 0 12px;" />
    <p style="margin:0 0 4px;font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;">Community Archive Daily Digest</p>
    <h1 class="digest-h1" style="margin:0 0 16px;font-family:${HEADING_FONT};font-size:30px;line-height:1.2;color:#111827;">${escapeHtml(prettyDate.dayPart)}<span class="digest-year">, ${escapeHtml(prettyDate.year)}</span></h1>
    <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.5;">${summaryHtml}</ul>
    ${topBangerHtml}
    ${storiesHtml}
    <p style="margin:0 0 32px;">
      <a href="${editionUrl}" style="color:#1d4ed8;font-size:14px;">Read the full digest with tweets →</a>
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;" />
    <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
      You are receiving this because you subscribed to the Community Archive Daily Digest.<br />
      <a href="${links.unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a>
    </p>
  </div>`

  const text = [
    `Community Archive Daily Digest — ${prettyDate.full}`,
    '',
    ...content.executiveSummary.map((line) => `* ${line}`),
    '',
    'TOP TWEET',
    tweetToText(content.topBanger),
    '',
    ...content.stories.flatMap((story) => [
      story.title.toUpperCase(),
      story.subtitle,
      ...story.bullets.map((bullet) => `- ${bullet}`),
      ...story.bangers
        .slice(0, BANGERS_PER_STORY)
        .flatMap((tweet) => ['', tweetToText(tweet)]),
      '',
    ]),
    `Read the full digest: ${editionUrl}`,
    '',
    `Unsubscribe: ${links.unsubscribeUrl}`,
  ].join('\n')

  return { subject, html, text }
}
