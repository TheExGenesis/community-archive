import type { DigestEdition } from '@/lib/digest/types'
import type { PortalTweet } from '@/lib/portal/types'
import type { DigestBulletinItem } from './bulletin'
import { formatDigestShareChange } from './trends'
import { formatNumber } from '@/lib/formatNumber'
import {
  digestPublicationDate,
  shouldShowRepresentativeTweet,
} from './presentation'

export interface DigestEmailLinks {
  siteUrl: string
  unsubscribeUrl: string
}

export interface DigestEmailOptions {
  personalizedBulletin?: boolean
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

const renderTweetCard = (
  tweet: PortalTweet,
  siteUrl: string,
  monochrome = false,
) => {
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
  <table role="presentation" width="100%" style="margin:0 0 12px;border:1px solid #e5e7eb;border-radius:${monochrome ? '0' : '10px'};border-collapse:separate;">
    <tr><td style="padding:12px 14px;">
      <table role="presentation"><tr>
        <td style="vertical-align:top;padding-right:10px;">${avatarHtml}</td>
        <td style="vertical-align:middle;">
          <p style="margin:0;font-size:14px;color:#111827;"><strong>${escapeHtml(tweet.name)}</strong></p>
          <p style="margin:0;font-size:13px;color:#6b7280;">@${escapeHtml(tweet.username)}</p>
        </td>
      </tr></table>
      <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#111827;">${escapeTweetText(tweet.text)}</p>
      ${photo ? `<img src="${escapeHtml(photo.url)}" alt="" style="margin:10px 16px 0;max-width:calc(100% - 32px);max-height:200px;width:auto;height:auto;object-fit:contain;border-radius:8px;display:block;" />` : ''}
      ${tweet.quotedTweet ? renderQuotedTweet(tweet.quotedTweet) : ''}
      <p style="margin:10px 0 0;font-size:12px;color:#6b7280;">♥ ${escapeHtml(formatNumber(tweet.likes))}${rtsHtml} &nbsp;·&nbsp; <a href="${tweetUrl}" style="color:${monochrome ? '#111827' : '#1d4ed8'};text-decoration:none;">View in the archive</a></p>
    </td></tr>
  </table>`
}

const tweetToText = (tweet: PortalTweet) =>
  [
    `${tweet.name} (@${tweet.username}):`,
    tweet.text,
    ...(tweet.quotedTweet
      ? [
          `> ${tweet.quotedTweet.name} (@${tweet.quotedTweet.username}): ${tweet.quotedTweet.text}`,
        ]
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
  bulletinItems: DigestBulletinItem[] = [],
  options: DigestEmailOptions = {},
): RenderedDigestEmail {
  const { content } = edition
  const showRepresentativeTweet = shouldShowRepresentativeTweet(content)
  const prettyDate = formatDigestDateParts(digestPublicationDate(edition))
  const editionUrl = `${links.siteUrl}/digest/${edition.digestDate}`
  const subject = `Community Archive Digest — ${prettyDate.full}`

  const summaryHtml = content.executiveSummary
    .map((line) => `<li style="margin:0 0 6px;">${escapeHtml(line)}</li>`)
    .join('')

  const storiesHtml = content.stories
    .map(
      (story, index) => `
      <table role="presentation" width="100%" style="margin:24px 0 20px;">
        <tr><td>
          <h2 style="margin:0 0 4px;font-family:${HEADING_FONT};font-size:26px;line-height:1.3;">
            <span style="display:inline-block;min-width:33px;font-family:${BODY_FONT};font-size:15px;font-weight:700;color:#111827;">${String(index + 1).padStart(2, '0')}.</span><a href="${editionUrl}/${encodeURIComponent(story.slug)}" style="color:#111827;text-decoration:none;">${escapeHtml(story.title)}</a>
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
              ? `<p style="margin:0;font-size:13px;"><a href="${editionUrl}/${encodeURIComponent(story.slug)}" style="color:#1d4ed8;">+ ${story.bangers.length - BANGERS_PER_STORY} more tweet${story.bangers.length - BANGERS_PER_STORY === 1 ? '' : 's'} in this story →</a></p>`
              : ''
          }
        </td></tr>
      </table>`,
    )
    .join('')

  const topBangerHtml = showRepresentativeTweet
    ? `
    <p style="margin:0 0 8px;font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;">Top tweet</p>
    ${renderTweetCard(content.topBanger, links.siteUrl)}`
    : ''

  const trendRows = content.trends?.terms ?? []
  const trendsHtml = trendRows.length
    ? `<section style="margin:0 0 25px;padding:17px 18px 16px;border:1px solid #dce5ea;border-radius:10px;background:#fbfdfe;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 15px;"><tr>
          <td style="font-family:${HEADING_FONT};font-size:20px;font-weight:600;color:#111827;">Trending terms · 7 days</td>
          <td align="right" style="font-size:12px;"><a href="${escapeHtml(links.siteUrl)}/trends" style="color:#247da9;text-decoration:none;">Explore current trends →</a></td>
        </tr></table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
          ${trendRows
            .map(
              (
                row,
                index,
              ) => `<td width="${trendRows.length === 2 ? '50%' : '100%'}" style="padding:${index === 0 && trendRows.length === 2 ? '0 15px 0 0' : index === 1 ? '0 0 0 16px' : '0'};vertical-align:top;${index === 0 && trendRows.length === 2 ? 'border-right:1px solid #e2e8f0;' : ''}">
            <p style="margin:0 0 5px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">#${index + 1} by tweet volume</p>
            <p style="margin:0 0 4px;font-size:27px;font-weight:700;line-height:1.15;color:#111827;">${row.tweets.toLocaleString('en-US')} <span style="font-size:13px;font-weight:400;color:#6b7280;">tweets</span></p>
            <p style="margin:0;font-size:13px;line-height:1.4;"><a href="${escapeHtml(links.siteUrl)}/search?${new URLSearchParams({ q: row.term })}" style="font-weight:700;color:#247da9;text-decoration:none;">${escapeHtml(row.term)}</a>${row.changePct === null ? '' : ` <span style="color:#6b7280;">· ${formatDigestShareChange(row.changePct)} share</span>`}</p>
          </td>`,
            )
            .join('')}
        </tr></table>
        <p style="margin:13px 0 0;font-size:11px;line-height:1.4;color:#6b7280;">${content.trends?.sinceDate}–${content.trends?.untilDate} UTC · Share change versus the previous seven days.</p>
      </section>`
    : ''

  const bulletin = bulletinItems.slice(0, 3)
  const bulletinHtml = bulletin.length
    ? `<section style="margin:72px 0 32px;padding:16px 0 12px;border-top:3px solid #111827;border-bottom:1px solid #111827;background:#ffffff;">
        <p style="margin:0 0 5px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#111827;">Community opportunities</p>
        <h2 style="margin:0 0 6px;font-family:${HEADING_FONT};font-size:26px;color:#111827;">New in the Bulletin${options.personalizedBulletin ? ` <span style="display:inline-block;vertical-align:middle;margin-left:8px;border:1px solid #111827;padding:3px 5px;font-family:${BODY_FONT};font-size:10px;font-weight:700;letter-spacing:0.08em;line-height:1.2;text-transform:uppercase;color:#111827;">For You</span>` : ''}</h2>
        <p style="margin:0 0 6px;color:#4b5563;font-size:13px;line-height:1.5;">Fresh asks and offers from Community Archive members</p>
        ${bulletin
          .map((item) => {
            const url = `https://x.com/${encodeURIComponent(item.tweet.username)}/status/${encodeURIComponent(item.tweet.id)}`
            const color = item.side === 'offer' ? '#0369a1' : '#9a5b1a'
            return `<div style="margin:20px 0 0;padding:16px;border:1px solid #e8e8e5;border-radius:8px;background:#ffffff;font-family:${BODY_FONT};">
              <p style="margin:0 0 10px;font-size:12px;font-weight:600;line-height:1.2;color:${color};">${escapeHtml(item.label)}</p>
              <p style="margin:0 0 12px;font-size:15px;font-weight:600;line-height:1.35;color:#111827;">${escapeHtml(item.summary)}</p>
              <p style="margin:0;font-size:13px;line-height:1.4;color:#6b7280;">${escapeHtml(item.tweet.name || `@${item.tweet.username}`)} · <a href="${escapeHtml(url)}" style="color:#0369a1;text-decoration:none;">Read on X →</a></p>
            </div>`
          })
          .join('')}
        <a href="${escapeHtml(links.siteUrl)}/bulletin" style="color:#111827;font-size:13px;">Explore the Bulletin (opt-in required) →</a>
      </section>`
    : ''

  const html = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Petrona:wght@500;600&family=Manrope:wght@400;500;700&display=swap');
    @media (max-width: 480px) {
      .digest-h1 { font-size: 27px !important; }
      .digest-year { display: none !important; }
    }
  </style>
  <div style="margin:0 auto;max-width:600px;padding:24px;font-family:${BODY_FONT};color:#111827;">
    <a href="${escapeHtml(links.siteUrl)}" style="display:inline-block;" aria-label="Community Archive website"><img src="${links.siteUrl}/images/email-logo.png" width="48" height="48" alt="Community Archive" style="display:block;margin:0 0 12px;" /></a>
    <p style="margin:0 0 4px;font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;">Community Archive Daily Digest</p>
    <h1 class="digest-h1" style="margin:0 0 16px;font-family:${HEADING_FONT};font-size:30px;line-height:1.2;color:#111827;">${escapeHtml(prettyDate.dayPart)}<span class="digest-year">, ${escapeHtml(prettyDate.year)}</span></h1>
    <p style="margin:0 0 20px;"><a href="${escapeHtml(editionUrl)}" style="color:#1d4ed8;font-size:14px;">Read on Community Archive →</a></p>
    <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.5;">${summaryHtml}</ul>
    ${trendsHtml}
    ${topBangerHtml}
    ${storiesHtml}
    <p style="margin:0 0 32px;">
      <a href="${editionUrl}" style="color:#1d4ed8;font-size:14px;">Read the full digest with tweets →</a>
    </p>
    ${bulletinHtml}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;" />
    <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
      You are receiving this because you subscribed to the Community Archive Daily Digest.<br />
      <a href="${links.unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a>
    </p>
  </div>`

  const text = [
    `Community Archive Daily Digest — ${prettyDate.full}`,
    `Read on Community Archive: ${editionUrl}`,
    '',
    ...content.executiveSummary.map((line) => `* ${line}`),
    '',
    ...(trendRows.length
      ? [
          'TRENDING TERMS · 7 DAYS',
          ...trendRows.map(
            (row, index) =>
              `#${index + 1} ${row.term} · ${row.tweets.toLocaleString('en-US')} tweets${row.changePct === null ? '' : ` · ${formatDigestShareChange(row.changePct)} share`}`,
          ),
          `${content.trends?.sinceDate}–${content.trends?.untilDate} UTC · Share change versus the previous seven days.`,
          `Explore current trends: ${links.siteUrl}/trends`,
          '',
        ]
      : []),
    ...(showRepresentativeTweet
      ? ['TOP TWEET', tweetToText(content.topBanger), '']
      : []),
    ...content.stories.flatMap((story, index) => [
      `${String(index + 1).padStart(2, '0')}. ${story.title.toUpperCase()}`,
      `${editionUrl}/${encodeURIComponent(story.slug)}`,
      story.subtitle,
      ...story.bullets.map((bullet) => `- ${bullet}`),
      ...story.bangers
        .slice(0, BANGERS_PER_STORY)
        .flatMap((tweet) => ['', tweetToText(tweet)]),
      '',
    ]),
    `Read the full digest: ${editionUrl}`,
    ...(bulletin.length
      ? [
          '',
          `NEW IN THE BULLETIN${options.personalizedBulletin ? ' · FOR YOU' : ''}`,
          'Fresh asks and offers from Community Archive members',
          ...bulletin.flatMap((item) => [
            `${item.label}: ${item.summary}`,
            tweetToText(item.tweet),
            `Respond on X: https://x.com/${encodeURIComponent(item.tweet.username)}/status/${encodeURIComponent(item.tweet.id)}`,
            '',
          ]),
          `Explore the Bulletin (opt-in required): ${links.siteUrl}/bulletin`,
        ]
      : []),
    '',
    `Unsubscribe: ${links.unsubscribeUrl}`,
  ].join('\n')

  return { subject, html, text }
}
