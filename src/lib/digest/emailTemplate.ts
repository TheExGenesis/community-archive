import type { DigestEdition } from '@/lib/digest/types'

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

const formatDigestDate = (digestDate: string) =>
  new Date(`${digestDate}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

export function renderDigestEmail(
  edition: DigestEdition,
  links: DigestEmailLinks,
): RenderedDigestEmail {
  const { content } = edition
  const prettyDate = formatDigestDate(edition.digestDate)
  const editionUrl = `${links.siteUrl}/digest/${edition.digestDate}`
  const subject = `Community Archive Digest — ${prettyDate}`

  const summaryHtml = content.executiveSummary
    .map((line) => `<li style="margin:0 0 6px;">${escapeHtml(line)}</li>`)
    .join('')

  const storiesHtml = content.stories
    .map(
      (story) => `
      <table role="presentation" width="100%" style="margin:0 0 20px;">
        <tr><td>
          <h2 style="margin:0 0 4px;font-size:18px;line-height:1.3;">
            <a href="${editionUrl}#${escapeHtml(story.slug)}" style="color:#1d4ed8;text-decoration:none;">${escapeHtml(story.title)}</a>
          </h2>
          <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.5;">${escapeHtml(story.subtitle)}</p>
          <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.5;">
            ${story.bullets.map((bullet) => `<li style="margin:0 0 4px;">${escapeHtml(bullet)}</li>`).join('')}
          </ul>
        </td></tr>
      </table>`,
    )
    .join('')

  const html = `
  <div style="margin:0 auto;max-width:600px;padding:24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;">Community Archive Daily Digest</p>
    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;">${escapeHtml(prettyDate)}</h1>
    <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.5;">${summaryHtml}</ul>
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
    `Community Archive Daily Digest — ${prettyDate}`,
    '',
    ...content.executiveSummary.map((line) => `* ${line}`),
    '',
    ...content.stories.flatMap((story) => [
      story.title.toUpperCase(),
      story.subtitle,
      ...story.bullets.map((bullet) => `- ${bullet}`),
      '',
    ]),
    `Read the full digest: ${editionUrl}`,
    '',
    `Unsubscribe: ${links.unsubscribeUrl}`,
  ].join('\n')

  return { subject, html, text }
}
