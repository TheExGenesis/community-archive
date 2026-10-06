'use client'

import Link from 'next/link'
import { Check, ChevronRight } from 'lucide-react'
import { useArchiveUpload } from '@/components/ArchiveUploadButton'
import {
  PanelHeader,
  captureDashboardDestination,
} from '@/components/portal/Portal'
import { CARD, MUTED, SERIF } from '@/components/portal/styles'
import { useBrowserExtensionStatus } from '@/hooks/useBrowserExtensionStatus'
import { CHROME_EXTENSION_URL } from '@/lib/browserExtension'
import type { DigestPreview } from '@/lib/digest/types'
import { userProfileHref } from '@/lib/navigation'
import { BANGERS_WEEK_HREF } from '@/lib/portal/bangers'
import type { MemberArchive } from '@/lib/memberHome'
import { RESEARCH_SOURCE, type ResearchPost } from '@/lib/portal/types'

const ARCHIVE_EXPORT_URL =
  'https://github.com/TheExGenesis/community-archive/releases/latest'

// Editions are keyed by UTC calendar day ("2026-09-24"); show "Wed 24 Sep".
const formatEditionDay = (digestDate: string) => {
  const day = new Date(`${digestDate}T00:00:00Z`)
  return Number.isNaN(day.getTime())
    ? digestDate
    : day.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
}

const formatDay = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

/**
 * The digest for a returning reader: headline and story links only. The full
 * editorial treatment stays on /digest.
 */
export function DigestBrief({ preview }: { preview: DigestPreview | null }) {
  const openDigest = () =>
    captureDashboardDestination('daily_digest', 'card', false)

  if (!preview) {
    return (
      <div className={`${CARD} border-t-2 border-t-brand px-6 py-6`}>
        <div
          className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${MUTED}`}
        >
          What happened yesterday
        </div>
        <p className="mt-2 text-[22px] font-medium" style={SERIF}>
          Today&rsquo;s edition is being assembled
        </p>
        <Link
          href={BANGERS_WEEK_HREF}
          onClick={() =>
            captureDashboardDestination('recent_bangers', 'card', false)
          }
          className="mt-3 inline-block text-[13px] font-semibold text-brand"
        >
          Explore today&rsquo;s bangers &rarr;
        </Link>
      </div>
    )
  }

  return (
    <div
      className={`${CARD} border-t-2 border-t-brand px-6 py-6 dark:border-t-brand`}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
            What happened yesterday
          </span>
          <span className={`text-[12px] tabular-nums ${MUTED}`}>
            {formatEditionDay(preview.digestDate)} &middot; {preview.storyCount}{' '}
            {preview.storyCount === 1 ? 'story' : 'stories'}
            {preview.isPreview ? ' · preview' : ''}
          </span>
        </span>
        <Link
          href={preview.href}
          onClick={openDigest}
          className="whitespace-nowrap text-[13px] font-semibold text-brand"
        >
          Read the edition &rarr;
        </Link>
      </div>

      {preview.headline && (
        <h2
          className="mb-5 max-w-[30ch] text-[24px] font-medium leading-[1.2] tracking-[-0.01em] sm:text-[30px]"
          style={SERIF}
        >
          <Link
            href={preview.href}
            onClick={openDigest}
            className="font-medium text-foreground transition-colors hover:text-brand"
          >
            {preview.headline}
          </Link>
        </h2>
      )}

      {preview.stories.length > 0 && (
        <ul className="m-0 list-none divide-y divide-zinc-200 border-t border-zinc-200 p-0 dark:divide-[#26262a] dark:border-[#26262a]">
          {preview.stories.map((story) => (
            <li key={story.slug} className="py-3.5">
              <div
                className={`text-[10.5px] font-semibold uppercase tracking-[0.12em] ${MUTED}`}
              >
                {story.tag}
              </div>
              <Link
                href={`${preview.href}/${story.slug}`}
                onClick={openDigest}
                className="mt-1 block text-[15.5px] font-semibold leading-snug transition-colors hover:text-brand"
              >
                {story.title}
              </Link>
              {story.blurb && (
                <p
                  className={`m-0 mt-1 line-clamp-2 text-[13px] leading-normal ${MUTED}`}
                >
                  {story.blurb}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type SetupStep = {
  title: string
  doneLabel: string
  done: boolean
  /** Why the step matters, in the site's own words. May hold its own link. */
  note: React.ReactNode
  /** Where the row goes; `upload` opens the archive picker in place. */
  target: { href: string; external?: boolean } | 'upload'
}

// The row is a plain container. The title is the real link or button, and
// its ::after overlay stretches the click area across the row, so a link in
// the note can sit above it (z-10) without nesting interactive elements.
const STEP_ROW =
  'group relative -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-[#1f1f23]'
const STEP_TRIGGER =
  "block text-left text-[13.5px] font-semibold leading-snug after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand/60 disabled:opacity-60"
const STEP_NOTE_LINK =
  'relative z-10 underline underline-offset-2 hover:text-brand'

function StepTrigger({
  step,
  onUpload,
  busy,
}: {
  step: SetupStep
  onUpload?: () => void
  busy?: boolean
}) {
  if (step.target === 'upload') {
    return (
      <button
        type="button"
        onClick={onUpload}
        disabled={busy}
        className={STEP_TRIGGER}
      >
        {busy ? 'Processing your archive…' : step.title}
      </button>
    )
  }
  return step.target.external ? (
    <a
      href={step.target.href}
      target="_blank"
      rel="noopener noreferrer"
      className={STEP_TRIGGER}
    >
      {step.title}
    </a>
  ) : (
    <Link href={step.target.href} className={STEP_TRIGGER}>
      {step.title}
    </Link>
  )
}

function StepLine({
  step,
  onUpload,
  busy,
}: {
  step: SetupStep
  onUpload?: () => void
  busy?: boolean
}) {
  return (
    <div className={STEP_ROW}>
      <span
        aria-hidden
        className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-zinc-300 dark:border-[#3a3a40]"
      />
      <div className="min-w-0 flex-1">
        <StepTrigger step={step} onUpload={onUpload} busy={busy} />
        <div className={`mt-0.5 text-[12px] leading-snug ${MUTED}`}>
          {step.note}
        </div>
      </div>
      <ChevronRight
        aria-hidden
        className="h-4 w-4 shrink-0 text-brand opacity-0 transition group-focus-within:opacity-100 group-hover:translate-x-0.5 group-hover:opacity-100"
      />
    </div>
  )
}

function UploadStepRow({ step }: { step: SetupStep }) {
  const { openPicker, isProcessing, elements } = useArchiveUpload()
  return (
    <>
      <StepLine step={step} onUpload={openPicker} busy={isProcessing} />
      {elements}
    </>
  )
}

function StepRow({ step }: { step: SetupStep }) {
  return step.target === 'upload' ? (
    <UploadStepRow step={step} />
  ) : (
    <StepLine step={step} />
  )
}

/**
 * Each open step is one clickable row. Finished steps fold into a single
 * line so the card shrinks as setup progresses.
 */
function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const open = steps.filter((step) => !step.done)
  const done = steps.filter((step) => step.done)
  return (
    <>
      <ul className="m-0 -my-2.5 list-none p-0">
        {open.map((step) => (
          <li key={step.title}>
            <StepRow step={step} />
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <p
          className={`m-0 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] ${open.length ? 'pt-5' : ''} ${MUTED}`}
        >
          {done.map((step) => (
            <span key={step.title} className="inline-flex items-center gap-1">
              <Check className="h-3.5 w-3.5 text-brand" strokeWidth={3} />
              {step.doneLabel}
            </span>
          ))}
        </p>
      )}
    </>
  )
}

const X_EXPORT_URL = 'https://x.com/settings/download_your_data'

/** Whole months between the archive's end and now, for the missing-posts note. */
function monthsBehind(archiveAt: string, now = Date.now()): number {
  const at = Date.parse(archiveAt)
  if (!Number.isFinite(at)) return 0
  return Math.floor((now - at) / (30.44 * 24 * 60 * 60 * 1000))
}

function RequestFromX({ children }: { children: React.ReactNode }) {
  return (
    <a
      href={X_EXPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={STEP_NOTE_LINK}
    >
      {children}
    </a>
  )
}

/** The archive as a checklist step, or null when it needs nothing from you. */
function archiveStep(
  archive: MemberArchive | null,
  stale: boolean,
): SetupStep | null {
  const upload = { doneLabel: 'Archive uploaded', target: 'upload' as const }
  if (!archive) {
    return {
      ...upload,
      title: 'Upload your archive',
      done: false,
      note: (
        <>
          Backfills your older posts.{' '}
          <RequestFromX>Request it from X</RequestFromX>
        </>
      ),
    }
  }
  if (archive.phase === 'failed') {
    return {
      ...upload,
      title: 'Upload your archive again',
      done: false,
      note: 'The last upload didn’t finish processing.',
    }
  }
  if (archive.phase !== 'completed') return null
  if (stale) {
    const months = monthsBehind(archive.archiveAt)
    return {
      ...upload,
      title: 'Upload a newer archive',
      done: false,
      note: (
        <>
          {months} months of posts are missing.{' '}
          <RequestFromX>Request a new export from X</RequestFromX>
        </>
      ),
    }
  }
  return { ...upload, title: 'Upload your archive', done: true, note: '' }
}

/** One line of context above the steps: what the archive holds. */
function ArchiveLine({ archive }: { archive: MemberArchive | null }) {
  if (!archive || archive.phase === 'failed') return null
  if (archive.phase !== 'completed') {
    return (
      <p className="m-0 mb-3 text-[13.5px]">
        Your archive is processing. Your tweets appear on your profile once it
        finishes.
      </p>
    )
  }
  return (
    <p className="m-0 mb-3 text-[13.5px]">
      <span className="font-semibold">
        {archive.numTweets !== null
          ? `${archive.numTweets.toLocaleString('en-US')} tweets archived`
          : 'Archive uploaded'}
      </span>
      <span className={MUTED}> · up to {formatDay(archive.archiveAt)}</span>
    </p>
  )
}

/**
 * The viewer's own state on the member home: one line about their archive,
 * then a checklist whose finished steps fold into a single line.
 */
export function YouCard({
  accountId,
  username,
  optedIn,
  archive,
  archiveStale,
}: {
  accountId: string | null
  username: string | null
  optedIn: boolean
  archive: MemberArchive | null
  archiveStale: boolean
}) {
  const extension = useBrowserExtensionStatus()
  // Profiles exist for the user directory: uploaded archives and opt-ins.
  const profileHref =
    accountId && (optedIn || archive?.phase === 'completed')
      ? userProfileHref(username, accountId)
      : null

  const archiveItem = archiveStep(archive, archiveStale)
  const steps: SetupStep[] = [
    ...(archiveItem ? [archiveItem] : []),
    {
      title: 'Opt in to tweet streaming',
      doneLabel: 'Opted in',
      done: optedIn,
      note: 'Your public tweets get preserved automatically.',
      target: { href: '/opt-in?redirect=/' },
    },
    // Hidden until the extension check settles, so it never flashes.
    ...(extension === 'checking'
      ? []
      : [
          {
            title: 'Install the browser extension',
            doneLabel: 'Extension installed',
            done: extension === 'installed',
            note: 'Adds public tweets as you browse X, between uploads.',
            target: { href: CHROME_EXTENSION_URL, external: true },
          },
        ]),
  ]

  return (
    <div className={`${CARD} flex flex-col`}>
      <PanelHeader
        title={username ? `@${username}` : 'You'}
        action={
          profileHref
            ? {
                label: 'Your profile',
                href: profileHref,
                analyticsDestination: 'your_profile',
              }
            : undefined
        }
      />
      <div className="flex flex-col px-4 pb-3.5 pt-4">
        <ArchiveLine archive={archive} />
        <SetupChecklist steps={steps} />
      </div>
      <Link
        href="/settings"
        className={`px-4 pb-3.5 text-[12.5px] font-medium transition-colors hover:text-brand ${MUTED}`}
      >
        Archive, streaming and email settings &rarr;
      </Link>
    </div>
  )
}

const ROW =
  'flex flex-col border-b border-zinc-100 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-zinc-50 dark:border-[#202023] dark:hover:bg-[#1f1f23]'

/** The newest research post, so the row shows what's actually there. */
export function LatestResearch({ post }: { post: ResearchPost | null }) {
  return (
    <div className={`${CARD} flex flex-col`}>
      <PanelHeader
        title="Latest research"
        action={{
          label: 'All research',
          href: '/research',
          analyticsDestination: 'research',
        }}
      />
      {post ? (
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            captureDashboardDestination('research_article', 'list', true)
          }
          className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-[#1f1f23]"
        >
          <div className="min-w-0 flex-1">
            <div
              className="text-[16px] font-semibold leading-snug transition-colors group-hover:text-brand"
              style={SERIF}
            >
              {post.title}
            </div>
            {post.excerpt && (
              <p
                className={`m-0 mt-1 line-clamp-2 text-[12.5px] leading-normal ${MUTED}`}
              >
                {post.excerpt}
              </p>
            )}
            <div className={`mt-1 text-[12px] ${MUTED}`}>
              {post.author ?? RESEARCH_SOURCE.name}
              {post.date && ` · ${formatDay(post.date)}`}
            </div>
          </div>
          {post.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.image}
              alt=""
              loading="lazy"
              className="mt-0.5 h-14 w-20 flex-shrink-0 rounded-[4px] border border-zinc-200 object-cover dark:border-[#26262a]"
            />
          )}
        </a>
      ) : (
        <p className={`m-0 px-4 py-3 text-[12.5px] ${MUTED}`}>
          Lab notes and papers built on the archive.
        </p>
      )}
    </div>
  )
}

/** What the public page gives whole sections, as two plain links. */
export function MemberLinks() {
  return (
    <nav aria-label="More from the archive" className={`${CARD} flex flex-col`}>
      <Link
        href="/community"
        onClick={() =>
          captureDashboardDestination('community_apps', 'list', false)
        }
        className={ROW}
      >
        <span className="text-[13.5px] font-semibold">Community apps</span>
        <span className={`text-[12px] ${MUTED}`}>
          Tools built on the archive
        </span>
      </Link>
      <a
        href={ARCHIVE_EXPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => captureDashboardDestination('data_export', 'list', true)}
        className={ROW}
      >
        <span className="text-[13.5px] font-semibold">Daily data export</span>
        <span className={`text-[12px] ${MUTED}`}>
          Tweets and profiles in Parquet
        </span>
      </a>
    </nav>
  )
}
