import { Suspense, type ReactNode } from 'react'
import { Megaphone, Star, Tv } from 'lucide-react'
import PostHogLink from '@/components/PostHogLink'
import { TweetRow } from '@/components/portal/TweetRow'
import { CARD, MUTED } from '@/components/portal/styles'
import {
  loadHomepageBangers,
  loadHomepageBulletin,
  loadHomepageTube,
} from '@/lib/homepageTools'
import { loadPortalComponentData } from '@/lib/portal/data'
import { BANGERS_WEEK_HREF } from '@/lib/portal/bangers'
import { cardLabel } from '@/lib/bulletin/types'
import { tubeThumbnail } from '@/lib/tube'

type ToolName = 'bangers' | 'tube' | 'bulletin'

function ToolLink({
  tool,
  target,
  href,
  className,
  children,
}: {
  tool: ToolName
  target: 'item' | 'more'
  href: string
  className?: string
  children: ReactNode
}) {
  return (
    <PostHogLink
      href={href}
      eventName="homepage_tool_clicked"
      eventProperties={{ tool, target }}
      className={className}
    >
      {children}
    </PostHogLink>
  )
}

function ToolPanel({
  tool,
  title,
  note,
  href,
  icon,
  children,
}: {
  tool: ToolName
  title: string
  note: string
  href: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={`home-tool-${tool}`}
      className={`${CARD} flex min-w-0 flex-col p-4`}
    >
      <header className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 id={`home-tool-${tool}`} className="text-[15px] font-semibold">
            {title}
          </h2>
          <p className={`text-[12.5px] ${MUTED}`}>{note}</p>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <ToolLink
        tool={tool}
        target="more"
        href={href}
        className="mt-3 inline-flex text-[13px] font-semibold text-brand hover:underline"
      >
        Open {title} →
      </ToolLink>
    </section>
  )
}

function PanelLoading() {
  return (
    <div
      role="status"
      className="h-48 animate-pulse rounded-md bg-muted/50"
      aria-label="Loading"
    />
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className={`py-6 text-sm ${MUTED}`}>{children}</p>
}

async function BangersItems() {
  const { data, failed } = await loadPortalComponentData(
    'tools-bangers',
    loadHomepageBangers,
    [],
  )
  if (!data.length)
    return (
      <Empty>
        {failed ? 'Bangers could not load.' : 'No bangers yet this week.'}
      </Empty>
    )
  return (
    <ol className="space-y-2">
      {data.map((tweet) => (
        <li key={tweet.id}>
          <TweetRow
            tweet={tweet}
            compact
            stacked
            previewHeight={120}
            origin="home"
            returnTo="/"
          />
        </li>
      ))}
    </ol>
  )
}

async function TubeItems() {
  const { data, failed } = await loadPortalComponentData(
    'tools-tube',
    loadHomepageTube,
    [],
  )
  if (!data.length)
    return (
      <Empty>{failed ? 'CA Tube could not load.' : 'No recent videos.'}</Empty>
    )
  return (
    <ol className="space-y-3">
      {data.map((video) => (
        <li key={video.id}>
          <ToolLink
            tool="tube"
            target="item"
            href={`/tube/watch/${video.id}`}
            className="group flex gap-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tubeThumbnail(video.id, false)}
              alt=""
              loading="lazy"
              className="aspect-video w-32 flex-shrink-0 rounded-md bg-muted object-cover"
            />
            <span className="min-w-0">
              <span className="line-clamp-2 text-[13.5px] font-medium leading-snug group-hover:text-brand">
                {video.title}
              </span>
              <span className={`mt-1 block text-xs ${MUTED}`}>
                {video.channel} · {video.n} sharers
              </span>
            </span>
          </ToolLink>
        </li>
      ))}
    </ol>
  )
}

async function BulletinItems() {
  const { data, failed } = await loadPortalComponentData(
    'tools-bulletin',
    loadHomepageBulletin,
    null,
  )
  if (data === null)
    return failed ? (
      <Empty>The bulletin could not load.</Empty>
    ) : (
      <div className="rounded-md border border-dashed border-border p-4 text-sm">
        <p className="font-medium">Asks and offers from members</p>
        <p className={`mt-1 ${MUTED}`}>
          Work, intros, invitations, and free things, picked out of the archive
          every day. Opt in to see what people near you are asking for.
        </p>
        <ToolLink
          tool="bulletin"
          target="item"
          href="/opt-in?redirect=/bulletin"
          className="mt-3 inline-flex rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-white"
        >
          Opt in to view
        </ToolLink>
      </div>
    )
  if (!data.length) return <Empty>No open notices right now.</Empty>
  return (
    <ol className="divide-y divide-border">
      {data.map((notice) => (
        <li key={notice.tweet_id} className="py-2.5 first:pt-0">
          <ToolLink
            tool="bulletin"
            target="item"
            href={`/tweets/${notice.tweet_id}`}
            className="group block"
          >
            <span className="inline-flex rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand-deep">
              {cardLabel(notice)}
            </span>
            <span className="mt-1 line-clamp-2 block text-[13.5px] leading-snug group-hover:text-brand">
              {notice.summary}
            </span>
            <span className={`mt-0.5 block text-xs ${MUTED}`}>
              @{notice.username}
            </span>
          </ToolLink>
        </li>
      ))}
    </ol>
  )
}

/** First-party tools transcluded under the digest: a taste of each, then a way in. */
export default function HomepageTools() {
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-3">
      <ToolPanel
        tool="bangers"
        title="Bangers"
        note="Most-quoted tweets this week"
        href={BANGERS_WEEK_HREF}
        icon={<Star className="h-[18px] w-[18px]" aria-hidden="true" />}
      >
        <Suspense fallback={<PanelLoading />}>
          <BangersItems />
        </Suspense>
      </ToolPanel>
      <ToolPanel
        tool="tube"
        title="CA Tube"
        note="Videos the community shared this month"
        href="/tube"
        icon={<Tv className="h-[18px] w-[18px]" aria-hidden="true" />}
      >
        <Suspense fallback={<PanelLoading />}>
          <TubeItems />
        </Suspense>
      </ToolPanel>
      <ToolPanel
        tool="bulletin"
        title="Bulletin Board"
        note="Asks, offers, and opportunities"
        href="/bulletin"
        icon={<Megaphone className="h-[18px] w-[18px]" aria-hidden="true" />}
      >
        <Suspense fallback={<PanelLoading />}>
          <BulletinItems />
        </Suspense>
      </ToolPanel>
    </div>
  )
}
