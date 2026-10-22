import Link from 'next/link'
import { Suspense } from 'react'
import StoryTabs from './StoryTabs'
import { getStrands } from '@/lib/community-apps/data'
import { filterStrands } from '@/lib/community-apps/strand-list'
import { getLatestDigestPreview } from '@/lib/digest/data'
import { measureServerRead } from '@/lib/performance/server'
import { SectionReady } from '@/components/PagePerformance'

export default function StoryColumn() {
  return (
    <StoryTabs
      digest={
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Loading digest…</p>
          }
        >
          <DigestStories />
        </Suspense>
      }
      strands={
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Loading strands…</p>
          }
        >
          <StrandStories />
        </Suspense>
      }
    />
  )
}

export async function DigestStories() {
  const preview = await measureServerRead(
    'homepage.map_stories',
    getLatestDigestPreview,
  ).catch(() => null)

  return (
    <div>
      <SectionReady section="homepage_map_stories" />
      <div className="mb-5 flex items-baseline justify-between gap-2 border-b border-border pb-3">
        <h2 className="text-xl font-semibold">The daily digest</h2>
        {preview ? (
          <span className="text-[11px] text-muted-foreground">
            {preview.digestDate}
          </span>
        ) : null}
      </div>
      {preview ? (
        <>
          <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
            {preview.headline}
          </p>
          <div className="flex gap-3 overflow-x-auto xl:block xl:divide-y xl:divide-border">
            {preview.stories.map((story, i) => (
              <Link
                key={story.slug}
                href={`${preview.href}/${story.slug}`}
                className="group block min-w-[230px] flex-1 py-5 xl:min-w-0"
              >
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-brand-deep">
                  {String(i + 1).padStart(2, '0')} · {story.tag}
                </span>
                <h3 className="text-sm font-semibold leading-relaxed group-hover:text-brand-deep">
                  {story.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {story.blurb}
                </p>
              </Link>
            ))}
          </div>
          <Link
            href={preview.href}
            className="mt-4 inline-block text-xs font-semibold text-brand-deep hover:underline"
          >
            {preview.isPreview
              ? 'Read the sample digest'
              : 'Read the whole edition'}{' '}
            ↗
          </Link>
        </>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          The next community digest will appear here. In the meantime, explore
          the map or{' '}
          <Link href="/strands" className="text-brand-deep underline">
            follow a strand
          </Link>
          .
        </p>
      )}
    </div>
  )
}

export async function StrandStories() {
  const result = await measureServerRead(
    'homepage.map_strands',
    getStrands,
  ).catch(() => null)
  const strands = result ? filterStrands(result.strands, '').slice(0, 6) : []
  return (
    <div>
      <SectionReady section="homepage_map_strands" />
      <h2 className="mb-4 border-b border-border pb-3 text-xl font-semibold">
        Follow a thread of thought
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Conversations and ideas that keep coming back.
      </p>
      {strands.length ? (
        <div className="flex gap-3 overflow-x-auto xl:block xl:divide-y xl:divide-border">
          {strands.map((strand, i) => (
            <Link
              key={strand.id}
              href={`/strands/${strand.id}`}
              className="group block min-w-[230px] flex-1 py-5 xl:min-w-0"
            >
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-brand-deep">
                {String(i + 1).padStart(2, '0')} ·{' '}
                {strand.totalPosts
                  ? `${strand.totalPosts.toLocaleString('en-US')} posts`
                  : 'Strand'}
              </span>
              <h3 className="text-sm font-semibold leading-relaxed group-hover:text-brand-deep">
                {strand.title}
              </h3>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {strand.summary.split(/\n\n/)[0]}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          {result
            ? 'No strands are available yet.'
            : 'Strands are temporarily unavailable.'}
        </p>
      )}
      <Link
        href="/strands"
        className="mt-4 inline-block text-xs font-semibold text-brand-deep hover:underline"
      >
        Explore all strands ↗
      </Link>
    </div>
  )
}
