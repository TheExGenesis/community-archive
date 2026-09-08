import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import type { StrandCardItem } from '@/lib/community-apps/types'
import { StrandCardFocus } from './StrandFocus'
import { StrandActivity } from './StrandActivity'
import { STRAND_CLUSTER_NAMES } from '@/lib/community-apps/strand-cluster-names'
import { AnalysisText } from '@/components/community-apps/AnalysisText'

export function StrandCard({ strand }: { strand: StrandCardItem }) {
  return (
    <StrandCardFocus
      id={strand.id}
      className="overflow-hidden border-2 border-foreground/80 bg-card shadow-[3px_3px_0_0_hsl(var(--foreground)/0.15)]"
    >
      <div className="grid sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 border-b border-border p-4 sm:border-b-0 sm:border-r">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            The seed post
          </p>
          {strand.tweet ? (
            <TweetCard
              tweet={strand.tweet}
              showDate
              noClamp
              clickable={false}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Seed post unavailable.{' '}
              <Link className="text-brand" href={`/tweets/${strand.id}`}>
                Open source ↗
              </Link>
            </p>
          )}
        </div>
        <div className="min-w-0 p-5">
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {strand.position && (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: strand.position.color }}
                />
                {STRAND_CLUSTER_NAMES[strand.position.cluster]}
              </span>
            )}
            {strand.totalPosts !== undefined && (
              <span title="Posts included in the original strand snapshot">
                · {strand.totalPosts.toLocaleString('en-US')} posts
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold leading-tight">
            <a href={`/strands/${strand.id}`} className="hover:text-brand">
              {strand.title}
            </a>
          </h2>
          <div className="mt-3 text-sm leading-6">
            <AnalysisText>{strand.summary.split(/\n\n/)[0]}</AnalysisText>
          </div>
          <StrandActivity
            activity={strand.activity}
            color={strand.position?.color}
          />
          <a
            href={`/strands/${strand.id}`}
            className="mt-4 inline-block text-sm font-semibold text-brand"
          >
            Explore the strand →
          </a>
        </div>
      </div>
    </StrandCardFocus>
  )
}
