import 'server-only'
import { unstable_cache } from 'next/cache'
import { getStrands } from '@/lib/community-apps/data'
import { filterStrands } from '@/lib/community-apps/strand-list'
import { markdownToPlainText } from '@/lib/digest/markdown'
import type { DigestStory } from '@/lib/digest/types'
import { createServerAnonClient } from '@/utils/supabase'
import {
  matchDigestStories,
  type DigestSearchEntry,
  type RelatedResults,
  type RelatedStrand,
  type RelatedDigestStory,
} from './relatedContentMatch'

const RESULT_LIMIT = 3

export async function searchRelatedStrands(
  query: string,
): Promise<RelatedResults<RelatedStrand>> {
  const { strands } = await getStrands()
  const matches = filterStrands(strands, query)
  return {
    items: matches
      .slice(0, RESULT_LIMIT)
      .map(({ id, title, summary, username }) => ({
        id,
        title,
        summary: markdownToPlainText(summary.split(/\n\n/)[0]),
        username,
      })),
    total: matches.length,
  }
}

// Published editions are small (a few hundred stories), so a slim text index
// is cheaper than a full-text column. Bangers are kept as plain text so a
// story is found by the posts it quotes, not only by its own copy.
const loadDigestSearchIndex = unstable_cache(
  async (): Promise<DigestSearchEntry[]> => {
    const { data, error } = await createServerAnonClient()
      .from('digest_editions')
      .select('digest_date, published_at, stories:content->stories')
      .eq('status', 'published')
      .order('digest_date', { ascending: false })
    if (error) throw new Error('Digest search index is unavailable')
    return (data ?? []).flatMap((row) => {
      const stories = (row as { stories: DigestStory[] | null }).stories
      if (!Array.isArray(stories)) return []
      // Editions are labelled by the day they went out, like the digest pages.
      const published = row.published_at ? new Date(row.published_at) : null
      const publishedDate =
        published && !Number.isNaN(published.getTime())
          ? published.toISOString().slice(0, 10)
          : row.digest_date
      return stories.flatMap((story) =>
        story?.slug && story.title
          ? [
              {
                digestDate: row.digest_date,
                publishedDate,
                slug: story.slug,
                title: markdownToPlainText(story.title),
                subtitle: markdownToPlainText(story.subtitle ?? ''),
                category: story.category ?? story.keyword ?? null,
                keyword: story.keyword ?? '',
                notes: [...(story.bullets ?? []), story.editorialNote ?? '']
                  .map(markdownToPlainText)
                  .join(' '),
                posts: [...(story.bangers ?? []), ...(story.commentary ?? [])]
                  .map((tweet) => tweet?.text ?? '')
                  .join(' '),
              },
            ]
          : [],
      )
    })
  },
  ['digest-search-index-v1'],
  { revalidate: 300 },
)

export async function searchRelatedDigestStories(
  query: string,
): Promise<RelatedResults<RelatedDigestStory>> {
  const matches = matchDigestStories(await loadDigestSearchIndex(), query)
  return {
    items: matches
      .slice(0, RESULT_LIMIT)
      .map(({ digestDate, publishedDate, slug, title, subtitle }) => ({
        digestDate,
        publishedDate,
        slug,
        title,
        subtitle,
      })),
    total: matches.length,
  }
}
