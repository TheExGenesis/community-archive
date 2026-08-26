import 'server-only'
import { ResearchPost, RESEARCH_SOURCE } from './types'

const FEED_URL = `${RESEARCH_SOURCE.url}/feed`

// Substack serves RSS to browsers; plain fetch UAs sometimes get filtered.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const pickTag = (block: string, tag: string): string | null => {
  const match = block.match(
    new RegExp(
      `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    ),
  )
  return match ? match[1].trim() : null
}

// Only surface posts about the Community Archive / the lab-notes research
// program. The substack also carries personal essays (reading the classics,
// history-from-memory, interviews) that don't belong on the portal, so a post
// must match one of these title keywords to be shown.
const RELEVANT_TITLE_KEYWORDS = [
  'lab notes',
  'community archive',
  'twitter',
  'tweet',
  'tpot',
  'banger',
  'nooscope',
  'ideas spread',
  'social data',
  'social media',
  'hackathon',
  'sensemaking',
  'serendipity',
  'epistemic garden',
]

const EXCLUDED_RESEARCH_URLS = new Set([
  'https://xiqo.substack.com/p/the-community-archive-rises-from',
])

const isRelevant = (title: string, url: string): boolean => {
  if (EXCLUDED_RESEARCH_URLS.has(url)) return false
  const lower = title.toLowerCase()
  return RELEVANT_TITLE_KEYWORDS.some((k) => lower.includes(k))
}

const FEATURED_RESEARCH_TITLES = [
  'towards a pattern language of serendipity online',
  'agentic taste modeling',
  'a theory of tpot',
  'opportunity mining',
] as const

/** Select the four editorial homepage posts in their intended display order. */
export function selectFeaturedResearchPosts(
  posts: ResearchPost[],
): ResearchPost[] {
  const remaining = new Set(posts.map((post) => post.url))
  return FEATURED_RESEARCH_TITLES.flatMap((title): ResearchPost[] => {
    const post = posts.find(
      (candidate) =>
        remaining.has(candidate.url) &&
        candidate.title.trim().toLocaleLowerCase().includes(title),
    )
    if (!post) return []
    remaining.delete(post.url)
    return [post]
  })
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")

/**
 * Latest posts from the research Substack, parsed from its RSS feed.
 * Cached for an hour via the fetch layer; returns [] on any failure so the
 * portal renders without the widget's content rather than erroring.
 */
export async function getResearchPosts(limit = 12): Promise<ResearchPost[]> {
  try {
    const res = await fetch(FEED_URL, {
      headers: { 'User-Agent': BROWSER_UA },
      next: { revalidate: 3600 },
    })
    if (!res.ok) {
      console.error(`Research feed fetch failed: ${res.status}`)
      return []
    }
    const xml = await res.text()

    const items = xml.split('<item>').slice(1)
    const posts = items.flatMap((raw): ResearchPost[] => {
      const block = raw.split('</item>')[0]
      const title = pickTag(block, 'title')
      const url = pickTag(block, 'link')
      if (!title || !url || !isRelevant(title, url)) return []
      const pubDate = pickTag(block, 'pubDate')
      const image = block.match(/<enclosure url="([^"]+)"/)?.[1] ?? null
      return [
        {
          title: decodeEntities(title),
          url,
          date: pubDate ? new Date(pubDate).toISOString() : '',
          excerpt: decodeEntities(pickTag(block, 'description') ?? ''),
          image,
          author: decodeEntities(pickTag(block, 'dc:creator') ?? '') || null,
        },
      ]
    })
    return posts.slice(0, limit)
  } catch (error) {
    console.error('Research feed fetch failed:', error)
    return []
  }
}
