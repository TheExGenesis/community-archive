'use client'
import type { PortalTweet } from '@/lib/portal/types'
import TweetCard from '@/components/TweetCard'
import { useReportSectionReady } from '@/components/PagePerformance'
import { usePortalStream } from './usePortalStream'
import { CARD, MUTED } from './styles'
export function StreamFeed({
  tweets,
  failed,
}: {
  tweets: PortalTweet[]
  failed: boolean
}) {
  const { visible, streamUnavailable, loadMoreTarget, isLoadingMore, hasMore } =
    usePortalStream(
      { initialStream: tweets, failures: { initialStream: failed } },
      'stream',
    )
  useReportSectionReady('stream_feed', !streamUnavailable)
  return (
    <>
      {' '}
      <div className={`${CARD} overflow-hidden`}>
        {visible.map((t, i) => (
          <TweetCard
            key={t.id}
            tweet={t}
            animate={i === 0}
            showArchivedBadge
            origin="stream"
            returnTo="/stream"
          />
        ))}
        {visible.length === 0 && streamUnavailable && (
          <p role="status" className="p-8 text-center">
            Live stream is temporarily unavailable.
          </p>
        )}
        {visible.length === 0 && !streamUnavailable && (
          <div className={`px-4 py-8 text-center text-[13px] ${MUTED}`}>
            Waiting for the firehose…
          </div>
        )}
      </div>
      <div
        ref={loadMoreTarget}
        aria-live="polite"
        className={`py-5 text-center text-[12.5px] ${MUTED}`}
      >
        {isLoadingMore
          ? 'Loading older tweets…'
          : hasMore
            ? 'Scroll for older tweets'
            : visible.length > 0
              ? 'You’ve reached the end.'
              : ''}
      </div>
    </>
  )
}
