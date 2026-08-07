import { FaExternalLinkAlt } from 'react-icons/fa'
import { getResearchPosts } from '@/lib/portal/research'
import { RESEARCH_SOURCE } from '@/lib/portal/types'
import { MUTED, SERIF } from '@/components/portal/styles'

export const metadata = { title: 'Research · Community Archive' }

// Refresh the listing hourly (the feed fetch itself is also cached for 1h).
export const revalidate = 3600

// Public: research built on the archive is useful to visitors and members.
export default async function ResearchPage() {
  const posts = await getResearchPosts()

  return (
    <main className="mx-auto min-h-screen max-w-[900px] px-4 py-6 sm:px-6">
      <h1 className="mb-1.5 text-[26px] font-semibold" style={SERIF}>
        Research
      </h1>
      <div className={`mb-[18px] text-[13px] ${MUTED}`}>
        Research and lab notes built on the archive, from{' '}
        <a
          href={RESEARCH_SOURCE.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand hover:underline"
        >
          {RESEARCH_SOURCE.name}
        </a>
        .
      </div>

      {posts.length === 0 ? (
        <div className={`py-16 text-center text-[14px] ${MUTED}`}>
          Couldn&apos;t load the feed right now — read the latest directly at{' '}
          <a
            href={RESEARCH_SOURCE.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand hover:underline"
          >
            {RESEARCH_SOURCE.name}
          </a>
          .
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {posts.map((post) => (
            <a
              key={post.url}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-[4px] border border-zinc-200 bg-white transition-colors hover:border-brand/60 dark:border-[#26262a] dark:bg-[#1b1b1e]"
            >
              {post.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.image}
                  alt=""
                  loading="lazy"
                  className="h-36 w-full border-b border-zinc-200 object-cover dark:border-[#26262a]"
                />
              )}
              <div className="p-[18px]">
                <div
                  className="flex items-baseline gap-2 text-[19px] font-semibold leading-snug"
                  style={SERIF}
                >
                  {post.title}
                  <FaExternalLinkAlt className="h-3 w-3 flex-shrink-0 text-zinc-900 opacity-0 transition-opacity group-hover:opacity-70 dark:text-white" />
                </div>
                {post.excerpt && (
                  <div
                    className={`mt-2 line-clamp-3 text-[13px] leading-normal ${MUTED}`}
                  >
                    {post.excerpt}
                  </div>
                )}
                <div className={`mt-2.5 text-[12px] ${MUTED}`}>
                  {post.author ?? RESEARCH_SOURCE.name}
                  {post.date &&
                    ` · ${new Date(post.date).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}`}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </main>
  )
}
