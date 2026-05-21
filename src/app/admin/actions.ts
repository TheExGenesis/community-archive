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
      archiveDeleted: boolean
      // Populated by manualOptIn (and only manualOptIn) so the client can
      // materialize a fully-rendered row when the affected account wasn't
      // already in the visible list. Row-mutation actions leave this
      // undefined; their callers preserve the existing row's account data.
      account?: AccountRecord | null
      archiveUploadCount?: number
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

async function deleteStorageFiles(
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

    if (deleteData) {
      if (!twitterUserId) {
        return {
          ok: false,
          error: 'Missing Twitter account id for delete',
        }
      }
      const deleteResponse = await admin.rpc('delete_user_archive', {
        p_account_id: twitterUserId,
      })
      if (deleteResponse.error) {
        return { ok: false, error: deleteResponse.error.message }
      }
      await deleteStorageFiles(admin, username)
    }

    revalidatePath('/admin')
    return {
      ok: true,
      optInRecord: writeResponse.data as OptInRecord,
      // Opt out always adds to the scrape blocklist when we have an account id.
      blockedFromScraping: !!twitterUserId,
      archiveDeleted: deleteData,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to opt out',
    }
  }
}

