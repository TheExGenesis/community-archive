'use server'

import { revalidatePath } from 'next/cache'
import {
  AccountRecord,
  AccountsCursor,
  AccountsPage,
  OptInRecord,
  getAdminClient,
  loadInitialAccounts,
  loadMoreAccountsData,
  lookupAccountIdByUsername,
  normalizeUsername,
  requireAdmin,
} from './data'

// Returned to the client so it can patch the affected row in place — no
// refetch round-trip and no risk of resolving to undefined on the wire (which
// is what threw "Cannot read properties of undefined (reading 'rows')" when
// revalidatePath + searchAccountsAction raced against an action that
// triggered a redirect).
export type AdminActionResult =
  | {
      ok: true
      optInRecord: OptInRecord
      blockedFromScraping: boolean
      // True iff the action also wiped archive data (opt-out and delete).
      // For "Opt out and delete data" this is now FALSE at the moment of
      // the response: the actual delete + export runs asynchronously on
      // the worker (see docs/admin-delete-worker.md). Row's account data
      // stays populated until the worker completes the deletion.
      archiveDeleted: boolean
      // Populated by manualOptIn (and only manualOptIn) so the client can
      // materialize a fully-rendered row when the affected account wasn't
      // already in the visible list. Row-mutation actions leave this
      // undefined; their callers preserve the existing row's account data.
      account?: AccountRecord | null
      archiveUploadCount?: number
      // Optional flash message to surface in the action dialog (e.g.
      // "Queued for delete; worker will complete in a few minutes").
      message?: string
    }
  | { ok: false; error: string }

const OPT_IN_SELECT =
  'id, user_id, username, twitter_user_id, opted_in, explicit_optout, opt_out_reason, updated_at, opted_in_at, opted_out_at'

async function isBlocked(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  accountId: string,
): Promise<boolean> {
  if (!accountId) return false
  const { data } = await admin.rpc(
    'admin_list_blocked_scraping_users' as never,
    { p_account_ids: [accountId] } as never,
  )
  return Array.isArray(data) && (data as string[]).includes(accountId)
}

async function deleteScrapeBlock(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  accountId: string,
) {
  if (!accountId) return
  const { error } = await admin.rpc(
    'admin_set_scrape_block' as never,
    {
      p_account_id: accountId,
      p_blocked: false,
    } as never,
  )
  if (error) throw error
}

async function upsertScrapeBlock(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  accountId: string,
) {
  if (!accountId) return
  const { error } = await admin.rpc(
    'admin_set_scrape_block' as never,
    {
      p_account_id: accountId,
      p_blocked: true,
    } as never,
  )
  if (error) throw error
}

async function deleteSourceArchiveFiles(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  username: string,
) {
  const { data: fileList, error: listError } = await admin.storage
    .from('archives')
    .list(username)
  if (listError) throw listError
  if (!fileList?.length) return
  const filesToDelete = fileList.map((file) => `${username}/${file.name}`)
  const { error: deleteError } = await admin.storage
    .from('archives')
    .remove(filesToDelete)
  if (deleteError) throw deleteError
}

const EXPORT_BUCKET = 'admin-deleted-user-data'

// Inline backup before delete. Runs from Vercel — fine for accounts under
// ~10k tweets; above that the tweets JSON dump risks the 60s function ceiling.
// The dialog warns the admin before they commit. Long-term, the Hetzner
// worker path (see docs/admin-delete-worker.md, TODO) is what we actually
// want.
async function exportUserDataInline(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  args: {
    accountId: string
    username: string
    reason: string
    requesterUserId: string
  },
): Promise<{
  exportPrefix: string
  archiveFilesCopied: number
  tweetsDumped: number
}> {
  const startedAt = new Date()
  const exportPrefix = `${startedAt.toISOString().replace(/[:.]/g, '-')}-${args.accountId}`

  // 1. Copy archive files from `archives/{username}/` to
  //    `admin-deleted-user-data/{exportPrefix}/archives/`.
  const { data: archiveFiles, error: listError } = await admin.storage
    .from('archives')
    .list(args.username)
  if (listError) {
    throw new Error(`Failed to list archives: ${listError.message}`)
  }
  let archiveFilesCopied = 0
  for (const file of archiveFiles ?? []) {
    const src = `${args.username}/${file.name}`
    const dst = `${exportPrefix}/archives/${file.name}`
    const { error: copyError } = await admin.storage
      .from('archives')
      .copy(src, dst, { destinationBucket: EXPORT_BUCKET })
    if (copyError) {
      throw new Error(`Failed to copy ${src}: ${copyError.message}`)
    }
    archiveFilesCopied += 1
  }

  // 2. Dump tweets table as JSON. PostgREST silently caps SELECTs at
  //    1000 rows by default (`max-rows`), so we MUST page through with
  //    `.range()` — without this, an account with >1000 tweets gets a
  //    silently-truncated export. See AGENTS.md → "Supabase gotchas".
  //    This is also the operation that can time out for large accounts;
  //    the UI warns above 10k. Workaround for genuinely large accounts
  //    is the Hetzner worker (TODO).
  const TWEET_PAGE_SIZE = 1000
  const tweets: unknown[] = []
  let offset = 0
  while (true) {
    const { data: page, error: tweetsError } = await admin
      .from('tweets')
      .select('*')
      // `.order('tweet_id')` keeps pagination stable even if rows shift
      // mid-export. tweet_id is the table's PK so the index is free.
      .order('tweet_id', { ascending: true })
      .eq('account_id', args.accountId)
      .range(offset, offset + TWEET_PAGE_SIZE - 1)
    if (tweetsError) {
      throw new Error(
        `Failed to dump tweets (offset ${offset}): ${tweetsError.message}`,
      )
    }
    const rows = page ?? []
    tweets.push(...rows)
    if (rows.length < TWEET_PAGE_SIZE) break
    offset += rows.length
  }
  const tweetsBlob = new Blob([JSON.stringify(tweets, null, 0)], {
    type: 'application/json',
  })
  const { error: tweetsUploadError } = await admin.storage
    .from(EXPORT_BUCKET)
    .upload(`${exportPrefix}/tweets.json`, tweetsBlob, {
      contentType: 'application/json',
      upsert: false,
    })
  if (tweetsUploadError) {
    throw new Error(`Failed to upload tweets.json: ${tweetsUploadError.message}`)
  }

  // 3. Manifest.
  const manifest = {
    account_id: args.accountId,
    username: args.username,
    reason: args.reason,
    requested_by_user_id: args.requesterUserId,
    started_at: startedAt.toISOString(),
    completed_at: new Date().toISOString(),
    archive_files_copied: archiveFilesCopied,
    tweets_dumped: tweets.length,
    notes:
      'Inline export from Vercel. Only the tweets table is dumped; other ' +
      'per-account tables (likes, followers, following, profile, etc.) ' +
      'are not yet exported — TODO: move to Hetzner worker. The original ' +
      'archive zip(s) under archives/ contain the most-faithful copy of ' +
      'the data.',
  }
  const { error: manifestError } = await admin.storage
    .from(EXPORT_BUCKET)
    .upload(
      `${exportPrefix}/manifest.json`,
      new Blob([JSON.stringify(manifest, null, 2)], {
        type: 'application/json',
      }),
      { contentType: 'application/json', upsert: false },
    )
  if (manifestError) {
    throw new Error(`Failed to upload manifest: ${manifestError.message}`)
  }

  return {
    exportPrefix,
    archiveFilesCopied,
    tweetsDumped: tweets.length,
  }
}

export async function loadMoreAccountsAction(input: {
  search: string
  cursor: AccountsCursor
  excludeAccountIds: string[]
  excludeUsernames: string[]
}): Promise<AccountsPage> {
  return loadMoreAccountsData(
    input.search,
    input.cursor,
    input.excludeAccountIds,
    input.excludeUsernames,
  )
}

export async function searchAccountsAction(search: string): Promise<{
  rows: AccountsPage['rows']
  nextCursor: AccountsCursor | null
  warning: string | null
  optInCount: number
}> {
  const data = await loadInitialAccounts(normalizeUsername(search))
  return {
    rows: data.rows,
    nextCursor: data.nextCursor,
    warning: data.warning,
    optInCount: data.optInCount,
  }
}

export async function manualOptIn(
  formData: FormData,
): Promise<AdminActionResult> {
  try {
    const admin = await getAdminClient()
    const username = normalizeUsername(String(formData.get('username') ?? ''))
    if (!username) {
      return { ok: false, error: 'Username is required' }
    }

    const accountId = await lookupAccountIdByUsername(admin, username)

    const update = {
      username,
      twitter_user_id: accountId,
      opted_in: true,
      explicit_optout: false,
      opt_out_reason: null,
    }

    const existingResponse = await admin
      .from('optin')
      .select('id')
      .eq('username', username)
      .maybeSingle()
    if (existingResponse.error) {
      return { ok: false, error: existingResponse.error.message }
    }

    const recordId = existingResponse.data?.id
    const writeResponse = recordId
      ? await admin
          .from('optin')
          .update(update)
          .eq('id', recordId)
          .select(OPT_IN_SELECT)
          .single()
      : await admin
          .from('optin')
          .insert({ ...update, user_id: null })
          .select(OPT_IN_SELECT)
          .single()
    if (writeResponse.error) {
      return { ok: false, error: writeResponse.error.message }
    }

    if (accountId) {
      await deleteScrapeBlock(admin, accountId)
    }

    // Fetch the matched all_account row + upload count so the client can
    // render the newly-prepended row with its tweet/upload counts populated.
    // Both are best-effort; on failure we just return null/0 and the user
    // can refresh to fill them in.
    let account: AccountRecord | null = null
    let archiveUploadCount = 0
    if (accountId) {
      const [accountRes, uploadsRes] = await Promise.all([
        admin
          .from('all_account')
          .select(
            'account_id, username, account_display_name, num_tweets, created_via, updated_at',
          )
          .eq('account_id', accountId)
          .maybeSingle(),
        admin
          .from('archive_upload')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', accountId),
      ])
      if (!accountRes.error && accountRes.data) {
        account = accountRes.data as AccountRecord
      }
      if (!uploadsRes.error) {
        archiveUploadCount = uploadsRes.count ?? 0
      }
    }

    revalidatePath('/admin')
    return {
      ok: true,
      optInRecord: writeResponse.data as OptInRecord,
      blockedFromScraping: false,
      archiveDeleted: false,
      account,
      archiveUploadCount,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to opt in',
    }
  }
}

export async function adminSetOptInState(
  formData: FormData,
): Promise<AdminActionResult> {
  try {
    const admin = await getAdminClient()
    const id = String(formData.get('id') ?? '')
    const username = normalizeUsername(String(formData.get('username') ?? ''))
    const twitterUserId = String(formData.get('twitter_user_id') ?? '')
    const state = String(formData.get('state') ?? '')

    if (!username) return { ok: false, error: 'Missing username' }

    const update =
      state === 'opted-in'
        ? {
            username,
            twitter_user_id: twitterUserId || null,
            opted_in: true,
            explicit_optout: false,
            opt_out_reason: null,
          }
        : state === 'neutral'
          ? {
              username,
              twitter_user_id: twitterUserId || null,
              opted_in: false,
              explicit_optout: false,
              opt_out_reason: null,
            }
          : null

    if (!update) return { ok: false, error: 'Unsupported opt-in state' }

    const existingResponse = id
      ? null
      : await admin
          .from('optin')
          .select('id')
          .eq('username', username)
          .maybeSingle()
    if (existingResponse?.error) {
      return { ok: false, error: existingResponse.error.message }
    }

    const recordId = id || existingResponse?.data?.id
    const writeResponse = recordId
      ? await admin
          .from('optin')
          .update(update)
          .eq('id', recordId)
          .select(OPT_IN_SELECT)
          .single()
      : await admin
          .from('optin')
          .insert({ ...update, user_id: null })
          .select(OPT_IN_SELECT)
          .single()
    if (writeResponse.error) {
      return { ok: false, error: writeResponse.error.message }
    }

    if (state === 'opted-in') {
      await deleteScrapeBlock(admin, twitterUserId)
    }

    revalidatePath('/admin')
    return {
      ok: true,
      optInRecord: writeResponse.data as OptInRecord,
      blockedFromScraping:
        state === 'opted-in' ? false : await isBlocked(admin, twitterUserId),
      archiveDeleted: false,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to update opt-in state',
    }
  }
}

export async function adminOptOutAccount(
  formData: FormData,
): Promise<AdminActionResult> {
  try {
    // requireAdmin both gates access and gives us the requester's auth.users.id,
    // which we record on the delete-with-export job for audit.
    const { user: requester } = await requireAdmin()
    const admin = await getAdminClient()
    const id = String(formData.get('id') ?? '')
    const username = normalizeUsername(String(formData.get('username') ?? ''))
    const twitterUserId = String(formData.get('twitter_user_id') ?? '')
    const reason =
      String(formData.get('reason') ?? '').trim() || 'Admin manual opt-out'
    const deleteData = String(formData.get('delete_data') ?? '') === 'true'

    if (!username) return { ok: false, error: 'Missing username' }

    if (twitterUserId) {
      await upsertScrapeBlock(admin, twitterUserId)
    }

    const optOutUpdate = {
      username,
      twitter_user_id: twitterUserId || null,
      opted_in: false,
      explicit_optout: true,
      opt_out_reason: reason,
    }

    const writeResponse = id
      ? await admin
          .from('optin')
          .update(optOutUpdate)
          .eq('id', id)
          .select(OPT_IN_SELECT)
          .single()
      : await admin
          .from('optin')
          .upsert(
            { ...optOutUpdate, user_id: null },
            { onConflict: 'username' },
          )
          .select(OPT_IN_SELECT)
          .single()
    if (writeResponse.error) {
      return { ok: false, error: writeResponse.error.message }
    }

    let message: string | undefined
    let archiveDeleted = false
    if (deleteData) {
      if (!twitterUserId) {
        return {
          ok: false,
          error: 'Missing Twitter account id for delete',
        }
      }
      // Inline export + delete from Vercel. Order matters: export first
      // (so there's a recovery path if delete fails), then delete the DB
      // rows, then remove source archive files. If any step throws, the
      // optin row has already been set to explicit_optout above, so the
      // user is at least blocked from streaming.
      // TODO: move to a Hetzner-side worker (see docs/admin-delete-worker.md
      // in this PR description). Inline-from-Vercel works for accounts
      // under ~10k tweets; above that the tweets JSON dump risks the 60s
      // function ceiling. The dialog warns the admin beforehand.
      const exportResult = await exportUserDataInline(admin, {
        accountId: twitterUserId,
        username,
        reason,
        requesterUserId: requester.id,
      })

      const deleteResponse = await admin.rpc('delete_user_archive', {
        p_account_id: twitterUserId,
      })
      if (deleteResponse.error) {
        return {
          ok: false,
          error: `Export succeeded (${exportResult.exportPrefix}) but delete_user_archive failed: ${deleteResponse.error.message}`,
        }
      }

      await deleteSourceArchiveFiles(admin, username)
      archiveDeleted = true

      message =
        `@${username}: exported ${exportResult.archiveFilesCopied} archive file(s) and ` +
        `${exportResult.tweetsDumped} tweet(s) to ${EXPORT_BUCKET}/${exportResult.exportPrefix}/, ` +
        `then deleted the account.`
    }

    revalidatePath('/admin')
    return {
      ok: true,
      optInRecord: writeResponse.data as OptInRecord,
      // Opt out always adds to the scrape blocklist when we have an account id.
      blockedFromScraping: !!twitterUserId,
      archiveDeleted,
      message,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to opt out',
    }
  }
}

