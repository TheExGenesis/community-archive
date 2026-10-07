// User-agent classification for work that should only run for people, such
// as paid model generation. The middleware already blocks scraping clients;
// these are the crawlers it deliberately lets through or never sees.

// Unfurlers fetch one URL each time a person shares a link, so they count as
// human-driven traffic. Lowercase substrings.
const LINK_PREVIEW_PATTERNS = [
  'twitterbot',
  'facebookexternalhit',
  'facebot',
  'slackbot',
  'slack-imgproxy',
  'discordbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'redditbot',
  'embedly',
  'quora link preview',
  'vkshare',
  'skypeuripreview',
  'iframely',
]

// Search, SEO, AI-training, and archiving crawlers, plus headless tooling.
const CRAWLER_PATTERN =
  /bot\b|bot\/|crawl|spider|slurp|archiver|scrap|headless|lighthouse|google-|mediapartners|yandex|baidu|bytedance|petalsearch/i

// Real devices whose model names happen to match the pattern above.
const DEVICE_FALSE_POSITIVES = /\bcubot\b/i

/** True for link-preview unfurlers acting on a person's share. */
export function isLinkPreviewAgent(userAgent: string | null | undefined) {
  const lower = (userAgent ?? '').toLowerCase()
  return LINK_PREVIEW_PATTERNS.some((pattern) => lower.includes(pattern))
}

/** True for automated crawlers; link-preview unfurlers are not counted. */
export function isCrawlerAgent(userAgent: string | null | undefined) {
  const ua = userAgent?.trim() ?? ''
  if (!ua) return true
  if (isLinkPreviewAgent(ua)) return false
  return CRAWLER_PATTERN.test(ua.replace(DEVICE_FALSE_POSITIVES, ''))
}
