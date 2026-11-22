import type { PortalTweet } from '@/lib/portal/types'
import {
  BODY_FONT,
  HEADING_FONT,
  escapeHtml,
  renderTweetCard,
  tweetToText,
} from '@/lib/digest/emailTemplate'
import { searchAlertLabel, searchAlertSearchHref } from './input'

/** Tweets shown per alert; the search link has the rest. Keeps the email under Gmail's clip size. */
export const EMAIL_TWEETS_PER_ALERT = 3

export interface SearchAlertEmailSection {
  query: string
  fromUser: string | null
  count: number
  since: string
  tweets: PortalTweet[]
}

export interface RenderedSearchAlertEmail {
  subject: string
  html: string
  text: string
}

const plural = (count: number, word: string) =>
  `${count.toLocaleString('en-US')} ${word}${
    count === 1 ? '' : /(?:s|x|z|ch|sh)$/.test(word) ? 'es' : 's'
  }`

export function renderSearchAlertEmail(
  sections: SearchAlertEmailSection[],
  links: { siteUrl: string; unsubscribeUrl: string; settingsUrl: string },
): RenderedSearchAlertEmail {
  const total = sections.reduce((sum, section) => sum + section.count, 0)
  const subject =
    sections.length === 1
      ? `${plural(total, 'new match')} for ${searchAlertLabel(sections[0])}`
      : `${plural(total, 'new match')} across ${sections.length} search alerts`

  const sectionHtml = sections
    .map((section) => {
      const searchUrl = `${links.siteUrl}${searchAlertSearchHref(section, section.since)}`
      const shown = section.tweets.slice(0, EMAIL_TWEETS_PER_ALERT)
      const more = section.count - shown.length
      return `
      <tr><td style="padding:24px 0 0;">
        <h2 style="margin:0 0 4px;font-family:${HEADING_FONT};font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(searchAlertLabel(section))}</h2>
        <p style="margin:0 0 12px;font-size:14px;color:#6b7280;">${escapeHtml(plural(section.count, 'new match'))}</p>
        ${shown.map((tweet) => renderTweetCard(tweet, links.siteUrl)).join('')}
        <p style="margin:4px 0 0;font-size:14px;"><a href="${escapeHtml(searchUrl)}" style="color:#1d4ed8;text-decoration:none;font-weight:600;">${more > 0 ? `See all ${escapeHtml(plural(section.count, 'match'))} in the archive` : 'Open this search in the archive'} &rarr;</a></p>
      </td></tr>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:${BODY_FONT};color:#111827;">
  <table role="presentation" width="100%" style="background:#f9fafb;"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;"><tr><td style="padding:28px 24px;">
      <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280;">Community Archive · Search alerts</p>
      <h1 style="margin:8px 0 0;font-family:${HEADING_FONT};font-size:26px;line-height:1.25;color:#111827;">${escapeHtml(plural(total, 'new match'))} since your last email</h1>
      <table role="presentation" width="100%">${sectionHtml}</table>
      <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280;">You get this daily roll-up because email is on for these search alerts. <a href="${escapeHtml(links.settingsUrl)}" style="color:#6b7280;">Manage alerts</a> · <a href="${escapeHtml(links.unsubscribeUrl)}" style="color:#6b7280;">Turn off alert emails</a></p>
    </td></tr></table>
  </td></tr></table>
</body>
</html>`

  const text = [
    `${plural(total, 'new match')} since your last email`,
    '',
    ...sections.flatMap((section) => [
      `${searchAlertLabel(section)}: ${plural(section.count, 'new match')}`,
      ...section.tweets
        .slice(0, EMAIL_TWEETS_PER_ALERT)
        .map((tweet) => `\n${tweetToText(tweet)}`),
      `\nSee them in the archive: ${links.siteUrl}${searchAlertSearchHref(section, section.since)}`,
      '',
    ]),
    `Manage alerts: ${links.settingsUrl}`,
    `Turn off alert emails: ${links.unsubscribeUrl}`,
  ].join('\n')

  return { subject, html, text }
}
