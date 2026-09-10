'use client'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  PiArrowDown,
  PiArrowSquareOut,
  PiArrowUp,
  PiArrowsDownUp,
  PiBriefcase,
  PiCalendarBlank,
  PiChatCircle,
  PiChatsCircle,
  PiCheck,
  PiGift,
  PiHandHeart,
  PiQuestion,
  PiUsersThree,
  PiX,
} from 'react-icons/pi'
import type { IconType } from 'react-icons'
import { useTweetBatch } from './useTweetBatch'
import { useBoardPages } from './useBoardPages'
import { TweetAvatar } from '@/components/TweetAvatar'
import type { PortalTweet } from '@/lib/portal/types'
import type { BulletinTweet } from '@/lib/bulletin/tweets'
import { decodeTweetText } from '@/lib/tweetText'
import { tweetPermalinkHref, userProfileHref } from '@/lib/navigation'
import {
  BULLETIN_PAGE_SIZE,
  KIND_ICONS,
  KIND_LABELS,
  RESPONSE_LABELS,
  cardLabel,
  kindKey,
  parseKinds,
  type BulletinPage,
  type Opportunity,
} from '@/lib/bulletin/types'
import {
  expiry,
  followLabel,
  isPast,
  relationship,
  sortNotices,
  uptake,
  type BulletinRelationships,
} from '@/lib/bulletin/board'
import styles from './OpportunityBoard.module.css'

const ExpandedTweetCard = lazy(() =>
  import('@/components/TweetCard').then((module) => ({
    default: module.TweetCard,
  })),
)

const EMPTY_GRAPH: BulletinRelationships = { outgoing: {}, available: false }
const ICONS: Record<string, IconType> = {
  gift: PiGift,
  briefcase: PiBriefcase,
  calendar: PiCalendarBlank,
  users: PiUsersThree,
  'hand-heart': PiHandHeart,
  chats: PiChatsCircle,
}
function KindIcon({ kind, size = 14 }: { kind: string; size?: number }) {
  const Icon = ICONS[KIND_ICONS[kind]]
  return Icon ? <Icon size={size} aria-hidden /> : null
}
const KINDS = Object.keys(KIND_LABELS)

function ScrollMore({ count, onMore }: { count: number; onMore: () => void }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const callback = useRef(onMore)
  callback.current = onMore
  const [manual, setManual] = useState(false)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setManual(true)
      return
    }
    let fired = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fired) {
          fired = true
          observer.disconnect()
          callback.current()
        }
      },
      { rootMargin: '200px' },
    )
    if (sentinel.current) observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [count])
  return (
    <div ref={sentinel} aria-label="Load more notices" className={styles.more}>
      {manual ? (
        <button onClick={onMore}>Show more</button>
      ) : (
        <span className="sr-only">More notices load as you scroll</span>
      )}
    </div>
  )
}

/** "3h ago", "4d ago", "3wk ago"; a short date once it is older than ~2 months. */
export function sinceLabel(value: string, now: number) {
  const diff = now - Date.parse(value)
  if (diff < 60_000) return 'just now'
  const minutes = Math.round(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.round(days / 7)
  if (weeks < 9) return `${weeks}wk ago`
  const date = new Date(value)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year:
      date.getUTCFullYear() === new Date(now).getUTCFullYear()
        ? undefined
        : 'numeric',
    timeZone: 'UTC',
  })
}
function exactStamp(value: string) {
  return (
    new Date(value).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }) + ' UTC'
  )
}
function shortDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
/** Only a date the author gave. Default lifetimes are not shown as if stated. */
function lifetime(notice: Opportunity, now: number) {
  if (!notice.expires_at) return ''
  const until = expiry(notice)!
  const date = shortDate(new Date(until - 1).toISOString())
  return until <= now ? `ended ${date}` : `until ${date}`
}
/** One action per notice, named by how the author asked to be reached. */
function respondAction(notice: Opportunity) {
  const tweetUrl = `https://twitter.com/${encodeURIComponent(notice.username)}/status/${notice.tweet_id}`
  switch (notice.respond) {
    case 'dm':
      return {
        label: 'DM on X',
        href: `https://twitter.com/messages/compose?recipient_id=${encodeURIComponent(notice.account_id)}`,
      }
    case 'reply':
      return { label: 'Reply on X', href: tweetUrl }
    case 'like':
      return { label: 'Like on X', href: tweetUrl }
    default:
      return { label: 'Open on X', href: tweetUrl }
  }
}

function NoticeCard({
  notice,
  loadTweet,
  badge,
  follow,
  replied,
  now,
  onKind,
}: {
  notice: Opportunity
  loadTweet: (id: string) => Promise<BulletinTweet>
  badge: string
  follow: string
  replied: boolean
  now: number
  onKind: (kind: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [tweet, setTweet] = useState<BulletinTweet | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!open) return
    let active = true
    setError(false)
    loadTweet(notice.tweet_id)
      .then((value) => {
        if (active) setTweet(value)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [notice.tweet_id, open, attempt, loadTweet])
  const fallback: PortalTweet = {
    id: notice.tweet_id,
    accountId: notice.account_id,
    username: notice.username,
    name: notice.display_name || notice.username,
    avatar: notice.avatar_url || null,
    text: notice.preview_text || '',
    createdAt: notice.posted_at,
    observedAt: notice.posted_at,
    likes: 0,
    rts: 0,
  }
  const past = isPast(notice, now)
  const action = respondAction(notice)
  const text = decodeTweetText(tweet?.text || notice.preview_text || '')
  const when = lifetime(notice, now)
  // Zero is hidden: the count only covers archived members, not all of X.
  const replies = uptake(notice) || null
  const meta = open && when && (
    <p className={styles.meta}>
      <span>{when}</span>
    </p>
  )
  const label = (
    <span
      className={`${styles.kind} ${notice.side === 'offer' ? styles.offer : styles.ask}`}
    >
      <button
        type="button"
        className={styles.kindButton}
        aria-label={`Filter by ${KIND_LABELS[notice.kind] || notice.kind}`}
        onClick={() => onKind(notice.kind)}
      >
        <KindIcon kind={notice.kind} size={13} />
        {cardLabel(notice)}
      </button>
      {badge && <span className={styles.rel}>{badge}</span>}
      {notice.place && <span className={styles.rel}>{notice.place}</span>}
    </span>
  )
  return (
    <article
      className={`${styles.notice} ${past ? styles.past : ''} ${open ? styles.open : ''}`}
      onClick={(event) => {
        if (open) return
        const target = event.target as HTMLElement
        if (target.closest('a, button')) return
        setOpen(true)
      }}
    >
      {open ? (
        <>
          <div className={styles.noticeHead}>
            {label}
            <button
              type="button"
              className={styles.close}
              aria-label={`Collapse tweet by @${notice.username}`}
              aria-expanded
              aria-controls={`original-${notice.tweet_id}`}
              onClick={() => setOpen(false)}
            >
              <PiX size={15} />
            </button>
          </div>
          <div id={`original-${notice.tweet_id}`} className={styles.expanded}>
            <Suspense fallback={<p className={styles.fullText}>{text}</p>}>
              <ExpandedTweetCard
                tweet={tweet || fallback}
                showEngagement={!!tweet}
                clickable={false}
                showDate
                stacked
                origin="opportunities"
                returnTo="/opportunities"
              />
            </Suspense>
            {!tweet && !error && (
              <p className={styles.hint}>Loading post details…</p>
            )}
            {error && (
              <button
                type="button"
                className={styles.hintButton}
                onClick={() => setAttempt((n) => n + 1)}
              >
                Retry post details
              </button>
            )}
            {tweet?.replies?.length ? (
              <div className={styles.replyList}>
                <p className={styles.replyHead}>
                  {tweet.replies.length === 1
                    ? '1 reply'
                    : `${tweet.replies.length} replies`}{' '}
                  from members
                </p>
                {tweet.replies.map((reply) => (
                  <ExpandedTweetCard
                    key={reply.id}
                    tweet={reply}
                    compact
                    noClamp
                    stacked
                    clickable={false}
                    showEngagement={false}
                    showDate
                    origin="opportunities"
                    returnTo="/opportunities"
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className={styles.foot}>
            {meta}
            <p className={styles.acts}>
              <a
                className={styles.primary}
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                title={RESPONSE_LABELS[notice.respond]}
              >
                {action.label} <PiArrowSquareOut size={12} aria-hidden />
              </a>
              <Link
                href={tweetPermalinkHref(
                  notice.tweet_id,
                  'opportunities',
                  '/opportunities',
                )}
              >
                See on CA
              </Link>
            </p>
          </div>
        </>
      ) : (
        <>
          {label}
          <span className={styles.corner}>
            <time
              dateTime={notice.posted_at}
              title={exactStamp(notice.posted_at)}
              className={styles.age}
            >
              {sinceLabel(notice.posted_at, now)}
            </time>
            <span className={styles.readHint} aria-hidden>
              click to read more
            </span>
          </span>
          <button
            type="button"
            className={styles.summaryButton}
            aria-label={`Read full tweet by @${notice.username}`}
            title={notice.summary}
            aria-expanded={false}
            aria-controls={`original-${notice.tweet_id}`}
            onClick={() => setOpen(true)}
          >
            <span className={styles.summary}>{notice.summary}</span>
          </button>
          <div className={styles.who}>
            <Link
              href={userProfileHref(notice.username, notice.account_id)}
              className={styles.author}
            >
              <TweetAvatar tweet={tweet || fallback} size={18} />
              <span>{notice.display_name || `@${notice.username}`}</span>
            </Link>
            {follow && <span className={styles.follow}>{follow}</span>}
            <span className={styles.facts}>
              {when && <span>{when}</span>}
              {replied && (
                <span className={styles.youReplied}>
                  <PiCheck size={12} aria-hidden /> you replied
                </span>
              )}
              {replies !== null && (
                <span
                  className={styles.replies}
                  aria-label={`${replies} ${replies === 1 ? 'reply' : 'replies'} from archived members`}
                >
                  <PiChatCircle size={13} aria-hidden />
                  {replies}
                </span>
              )}
            </span>
          </div>
        </>
      )}
    </article>
  )
}

export function OpportunityBoard({
  opportunities,
  initialPage,
  me = '',
  username = '',
  graph = EMPTY_GRAPH,
  now = Date.now(),
  isAdmin = false,
}: {
  opportunities: Opportunity[]
  initialPage?: BulletinPage
  me?: string
  username?: string
  graph?: BulletinRelationships
  now?: number
  isAdmin?: boolean
}) {
  const loadTweet = useTweetBatch()
  const [limit, setLimit] = useState(BULLETIN_PAGE_SIZE)
  const [side, setSide] = useState('all')
  const [kinds, setKinds] = useState<string[]>([])
  const kind = kindKey(kinds)
  const [search, setSearch] = useState('')
  const [past, setPast] = useState(false)
  const [recommended, setRecommended] = useState(true)
  const [ascending, setAscending] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const pages = useBoardPages(
    initialPage,
    { kind, side, search, past, recommended, ascending },
    hydrated,
  )
  const loaded = pages.page?.opportunities || opportunities
  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1))
    setKinds(parseKinds(p.get('kind') || 'all') ?? [])
    setSide(
      ['ask', 'offer'].includes(p.get('side') || '') ? p.get('side')! : 'all',
    )
    setPast(p.get('past') === '1')
    setRecommended(p.get('sort') !== 'newest')
    setAscending(p.get('dir') === 'asc')
    setHydrated(true)
  }, [])
  useEffect(() => {
    if (!hydrated) return
    const p = new URLSearchParams()
    if (kind !== 'all') p.set('kind', kind)
    if (side !== 'all') p.set('side', side)
    if (past) p.set('past', '1')
    if (!recommended) p.set('sort', 'newest')
    if (ascending) p.set('dir', 'asc')
    window.history.replaceState(
      null,
      '',
      window.location.pathname +
        window.location.search +
        (p.toString() ? '#' + p.toString() : ''),
    )
  }, [kind, side, past, recommended, ascending, hydrated])
  const needle = search.trim().toLowerCase()
  const matches = (o: Opportunity) =>
    (past || !isPast(o, now)) &&
    [o.summary, o.preview_text, o.username, o.place, ...o.topics]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle)
  const visible = useMemo(
    () =>
      sortNotices(
        loaded.filter(
          (o) =>
            matches(o) &&
            (!kinds.length || kinds.includes(o.kind)) &&
            (side === 'all' || o.side === side),
        ),
        recommended,
        me,
        graph,
        now,
        ascending,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, kind, side, past, needle, recommended, ascending, me, graph, now],
  )
  useEffect(() => {
    setLimit(BULLETIN_PAGE_SIZE)
  }, [kind, side, needle, past, recommended, ascending])
  // Counts under the other dimension's filter: server-provided when paging
  // server-side, otherwise derived from the notices in hand.
  const count = (key: string) => {
    if (initialPage) return pages.page?.counts[key] || 0
    return loaded.filter(
      (o) =>
        matches(o) &&
        (KINDS.includes(key)
          ? o.kind === key && (side === 'all' || o.side === side)
          : o.side === key && (!kinds.length || kinds.includes(o.kind))),
    ).length
  }
  const matching = initialPage
    ? KINDS.filter((id) => !kinds.length || kinds.includes(id)).reduce(
        (n, id) => n + count(id),
        0,
      )
    : visible.length
  const shown = initialPage ? visible.length : Math.min(limit, visible.length)
  const cursor = initialPage ? pages.page?.cursors[kind] : null
  const own = loaded.filter((o) => o.account_id === me)
  const answered = loaded.filter(
    (o) => o.account_id !== me && o.reply_account_ids?.includes(me),
  ).length
  return (
    <>
      <header className={styles.head}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Opportunities</h1>
          <details className={styles.about}>
            <summary aria-label="About this board">
              <PiQuestion size={20} aria-hidden />
            </summary>
            <div className={styles.aboutPanel}>
              <p>
                <b>What this is.</b> Asks and offers that members posted on X,
                found by a daily scan of the archive. Every card is a real
                tweet. Nothing is posted on your behalf.
              </p>
              <p>
                <b>Put something up.</b> Post an original tweet, not a reply or
                repost, that reads as an ask or an offer. Phrases like
                &quot;happy to help&quot;, &quot;looking for&quot;, &quot;anyone
                know&quot; or &quot;DM me&quot; get picked up. Starting with
                &quot;offer:&quot; or &quot;ask:&quot; is the surest way. It
                appears after the next daily scan, once your tweet is in the
                archive and the labeler agrees.
              </p>
              <p>
                <b>How long notices stay.</b> Asks 14 days, offers 60, unless
                the tweet names a date. Standing offers stay up. Quote your own
                notice to reset the clock.
              </p>
              <p>
                <b>Relevance.</b> Your notices first, then the 25 people you
                reply to and quote most, then everyone else. Unanswered asks
                come before answered ones. Click the active sort to reverse it.
              </p>
              <p>
                <b>The reply count.</b> Public replies and quote posts from
                archived members, shown with a speech bubble. It does not see
                replies from people outside the archive, so no count means
                unknown, not zero. DMs and outcomes are not counted.
              </p>
              <p>
                <b>What gets missed.</b> Replies, reposts, tweets without
                ask-or-offer phrasing, and anything not yet in the archive. The
                labeler also makes mistakes. Read the tweet before acting on it.
                The board keeps the latest 2,000 notices.
              </p>
              {me && (
                <p>
                  <b>You.</b> You (@{username || me}) have{' '}
                  {own.filter((o) => o.side === 'offer').length} offers and{' '}
                  {own.filter((o) => o.side === 'ask').length} asks here, and
                  the archive shows you replying to {answered} other notices.
                </p>
              )}
            </div>
          </details>
        </div>
        <p className={styles.lede}>
          Asks and offers that members posted on X, gathered from the archive
          each day.
        </p>
      </header>
      <div className={styles.sticky}>
        <div className={styles.controlRow}>
          <div className={styles.chips} role="group" aria-label="Category">
            {KINDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={kinds.includes(id)}
                onClick={() =>
                  setKinds((value) =>
                    value.includes(id)
                      ? value.filter((k) => k !== id)
                      : [...value, id],
                  )
                }
              >
                <KindIcon kind={id} />
                {KIND_LABELS[id]}
                <span className={styles.count}>{count(id)}</span>
              </button>
            ))}
          </div>
          <div className={styles.searchBox} role="search">
            <input
              className={styles.field}
              type="search"
              aria-label="Filter notices"
              placeholder="Filter notices"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div
              className={styles.segmented}
              role="group"
              aria-label="Notice type"
            >
              {(['all', 'offer', 'ask'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={side === id}
                  onClick={() => setSide(id)}
                >
                  {id === 'all' ? 'All' : id === 'offer' ? 'Offers' : 'Asks'}
                  {id !== 'all' && (
                    <span className={styles.count}>{count(id)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.bar}>
          <span role="status" className={styles.barCount}>
            {shown < matching ? `${shown} of ${matching}` : matching}{' '}
            {matching === 1 ? 'notice' : 'notices'}
          </span>
          <div className={styles.sortLinks} role="group" aria-label="Sort">
            <PiArrowsDownUp size={14} aria-hidden />
            {(
              [
                ['relevance', 'Relevance', true],
                ['date', 'Date', false],
              ] as const
            ).map(([id, text, rec], i) => {
              const active = recommended === rec
              const Arrow = ascending ? PiArrowUp : PiArrowDown
              return (
                <span key={id} className={styles.sortOption}>
                  {i > 0 && <span aria-hidden>·</span>}
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={`Sort by ${text.toLowerCase()}${active ? `, ${ascending ? 'ascending' : 'descending'}` : ''}`}
                    title={active ? 'Reverse order' : undefined}
                    onClick={() => {
                      if (active) setAscending((value) => !value)
                      else {
                        setRecommended(rec)
                        setAscending(false)
                      }
                    }}
                  >
                    {text}
                    {active && <Arrow size={12} aria-hidden />}
                  </button>
                </span>
              )
            })}
          </div>
          <label className={styles.pastToggle}>
            <input
              type="checkbox"
              aria-label="Show past notices"
              checked={past}
              onChange={(e) => setPast(e.target.checked)}
            />
            Show past
          </label>
        </div>
      </div>
      {pages.pending && (
        <p role="status" className={styles.pending}>
          {pages.error || 'Loading matching notices…'}
          {pages.error && (
            <button className={styles.hintButton} onClick={pages.retry}>
              Retry
            </button>
          )}
        </p>
      )}
      <div className={styles.board} aria-busy={pages.pending}>
        {!pages.pending &&
          visible
            .slice(0, initialPage ? undefined : limit)
            .map((o) => (
              <NoticeCard
                key={o.tweet_id}
                notice={o}
                loadTweet={loadTweet}
                badge={relationship(o, me, graph).label}
                follow={
                  o.account_id === me ? '' : followLabel(o.account_id, graph)
                }
                replied={
                  !!me &&
                  o.account_id !== me &&
                  !!o.reply_account_ids?.includes(me)
                }
                now={now}
                onKind={(id) =>
                  setKinds((value) =>
                    value.length === 1 && value[0] === id ? [] : [id],
                  )
                }
              />
            ))}
        {!pages.pending && !visible.length && (
          <p className={styles.empty}>No matching notices.</p>
        )}
      </div>
      {!pages.pending &&
        (initialPage
          ? cursor && !pages.loading[kind] && !pages.laneErrors[kind]
          : visible.length > limit) && (
          <ScrollMore
            key={`${kind}:${side}:${needle}:${past}:${recommended}`}
            count={shown}
            onMore={() =>
              initialPage
                ? void pages.loadMore(kind)
                : setLimit((n) => n + BULLETIN_PAGE_SIZE)
            }
          />
        )}
      {pages.loading[kind] && <p className={styles.empty}>Loading more…</p>}
      {pages.laneErrors[kind] && (
        <p className={styles.empty}>
          {pages.laneErrors[kind]}{' '}
          <button onClick={() => void pages.loadMore(kind)}>Retry</button>
        </p>
      )}
      <footer className={styles.footer}>
        <p>
          Thanks to <Link href="/user/maskys_">@maskys_</Link> for the first
          prototype.
        </p>
        {isAdmin && <Link href="/admin/opportunities">Run dashboard →</Link>}
      </footer>
    </>
  )
}
