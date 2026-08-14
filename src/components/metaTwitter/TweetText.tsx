import { Fragment } from 'react'

const decodeEntities = (text: string) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

const TOKEN_RE = /(https?:\/\/\S+|@\w{1,15})/g

/**
 * Tweet body: decodes HTML entities, links URLs and @mentions, and drops the
 * trailing t.co permalink when the tweet's media is rendered separately.
 */
export function TweetText({
  text,
  hasMedia,
}: {
  text: string
  hasMedia: boolean
}) {
  let decoded = decodeEntities(text)
  if (hasMedia) {
    decoded = decoded.replace(/(?:\s*https:\/\/t\.co\/\w+)+\s*$/, '')
  }
  const parts = decoded.split(TOKEN_RE)
  return (
    <div className="mt-0.5 whitespace-pre-line text-[15px] leading-[1.45]">
      {parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[hsl(var(--brand))] hover:underline"
            >
              {part.replace(/^https?:\/\//, '')}
            </a>
          )
        }
        if (/^@\w+$/.test(part)) {
          return (
            <a
              key={i}
              href={`https://x.com/${part.slice(1)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[hsl(var(--brand))] hover:underline"
            >
              {part}
            </a>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </div>
  )
}
