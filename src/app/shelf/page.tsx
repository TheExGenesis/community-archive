import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth-utils'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { userProfileHref } from '@/lib/navigation'
import { shelfPreviewAllowed } from '@/lib/shelf/access'
import { getOwnerShelf } from '@/lib/shelf/data'
import { ACCOUNT_ID_PATTERN } from '@/lib/shelf/shape'
import type { Shelf } from '@/lib/shelf/types'
import { ShelfCurator } from '@/components/shelf/ShelfCurator'
import { ShelfHeader } from '@/components/shelf/ShelfHeader'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Your shelf — Community Archive',
  robots: { index: false, follow: false },
}

interface PageProps {
  searchParams: { as?: string | string[] }
}

/**
 * The owner's curation view. The account always comes from the session's
 * app_metadata.provider_id. The single exception is the local preview:
 * `/shelf?as=<account_id>` views and curates that account without signing in,
 * only when shelfPreviewAllowed() holds (loopback admin preview AND a loopback
 * Supabase URL), so preview writes can never reach a remote database.
 */
async function resolveCurator(searchParams: PageProps['searchParams']) {
  const requested =
    typeof searchParams.as === 'string' &&
    ACCOUNT_ID_PATTERN.test(searchParams.as)
      ? searchParams.as
      : null
  if (requested && (await shelfPreviewAllowed()))
    return { accountId: requested, preview: true }
  const { user } = await requireAuth('/shelf')
  const providerId = user.app_metadata?.provider_id
  return {
    accountId:
      typeof providerId === 'string' && ACCOUNT_ID_PATTERN.test(providerId)
        ? providerId
        : null,
    preview: false,
  }
}

export default async function ShelfPage({ searchParams }: PageProps) {
  const { accountId, preview } = await resolveCurator(searchParams)
  if (!accountId)
    return (
      <Frame>
        <p className="px-4 py-14 text-center text-sm text-muted-foreground sm:px-6">
          Your shelf is linked to your X account. Sign in with X to curate it.
        </p>
      </Frame>
    )

  const [resolved, shelf] = await Promise.all([
    resolveProfileCore(accountId).catch(() => null),
    getOwnerShelf(accountId).catch((): Shelf | null => null),
  ])
  const username = resolved?.profile.username ?? accountId
  const displayName = resolved?.profile.account_display_name || `@${username}`
  const publicHref = `${userProfileHref(resolved?.profile.username, accountId)}/shelf`

  return (
    <Frame>
      {preview ? (
        <p className="border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground sm:px-6">
          Local preview of account {accountId}. Changes write to the local
          database.
        </p>
      ) : null}
      <ShelfHeader
        displayName={displayName}
        username={username}
        avatarUrl={resolved?.profile.avatar_media_url ?? null}
        profileHref={userProfileHref(resolved?.profile.username, accountId)}
        title="Your shelf"
        summary="Works found in your tweets. Nothing is public until you approve it."
        actions={
          <Link
            href={publicHref}
            className="rounded-full border border-border px-4 py-[7px] text-sm font-semibold hover:bg-muted"
          >
            View public shelf
          </Link>
        }
      />
      {shelf === null ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-6">
          Your shelf could not load. Refresh the page to try again.
        </p>
      ) : shelf.total === 0 ? (
        <div className="px-4 py-14 text-center sm:px-6">
          <p className="font-serif text-xl font-semibold">No works found yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Your shelf is built from the tweets in your uploaded archive. Check
            back after your archive has been processed.
          </p>
        </div>
      ) : (
        <ShelfCurator shelf={shelf} />
      )}
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center px-4 pb-24 pt-4 sm:px-6">
      <div className="h-fit w-full max-w-[1220px] overflow-hidden rounded-lg border border-border bg-card">
        {children}
      </div>
    </div>
  )
}
