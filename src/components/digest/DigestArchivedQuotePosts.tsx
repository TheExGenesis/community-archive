import TweetCard from '@/components/TweetCard'
import { MUTED } from '@/components/portal/styles'
import type { DigestQuotePosts } from '@/lib/digest/quotePosts'
import type { DigestEdition, DigestStory } from '@/lib/digest/types'

const sectionLabel =
  'text-[11.5px] font-bold uppercase tracking-[0.22em] text-zinc-800 dark:text-zinc-200'

export function DigestArchivedQuotePosts({
  edition,
  story,
  quotePosts,
}: {
  edition: DigestEdition
  story: DigestStory
  quotePosts: DigestQuotePosts[]
}) {
  const returnTo = `/digest/${edition.digestDate}/${story.slug}`
  const selectedCommentaryIds = new Set(story.commentary.map(({ id }) => id))
  const unselectedQuotePosts = quotePosts
    .map((group) => ({
      ...group,
      tweets: group.tweets.filter(
        (tweet) => !selectedCommentaryIds.has(tweet.id),
      ),
    }))
    .filter(({ tweets }) => tweets.length > 0)
  return (
    <>
      {unselectedQuotePosts.length ? (
        <section>
          <div className="flex items-center gap-3.5">
            <h2 className={sectionLabel}>Archived quote posts</h2>
            <span className="flex-1 border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <p className={`mt-2 text-sm leading-6 ${MUTED}`}>
            Community Archive members who quoted the featured bangers.
          </p>
          <div className="mt-5 space-y-8">
            {unselectedQuotePosts.map((group) => {
              const banger = story.bangers.find(
                ({ id }) => id === group.bangerId,
              )
              if (!banger) return null
              return (
                <section key={group.bangerId}>
                  <div className="mb-1 flex items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      Quotes of @{banger.username}
                    </span>
                    <span>· {group.totalCount} archived</span>
                  </div>
                  {group.tweets.map((tweet) => (
                    <TweetCard
                      key={tweet.id}
                      tweet={tweet}
                      variant="editorial"
                      collapsible
                      showDate
                      quotedTweetDisplay="summary"
                      origin="digest"
                      returnTo={returnTo}
                    />
                  ))}
                </section>
              )
            })}
          </div>
        </section>
      ) : null}
    </>
  )
}
