'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  AccountsCursor,
  AccountsPage,
  getAdminClient,
  loadInitialAccounts,
  loadMoreAccountsData,
  lookupAccountIdByUsername,
  normalizeUsername,
} from './data'

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

export async function manualOptIn(formData: FormData) {
  const admin = await getAdminClient()
  const username = normalizeUsername(String(formData.get('username') ?? ''))
  if (!username) {
    redirect(
      `/admin?flash=error&msg=${encodeURIComponent('Username is required')}`,
    )
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
  if (existingResponse.error) throw existingResponse.error

  const recordId = existingResponse.data?.id
  const response = recordId
    ? await admin.from('optin').update(update).eq('id', recordId)
    : await admin.from('optin').insert({ ...update, user_id: null })
  if (response.error) throw response.error

  if (accountId) {
    await deleteScrapeBlock(admin, accountId)
  }

  revalidatePath('/admin')
  const msg = accountId
    ? `Opted in @${username} (account ${accountId})`
    : `Opted in @${username} (no matching account found, stored without twitter id)`
  redirect(`/admin?flash=ok&msg=${encodeURIComponent(msg)}`)
}

export async function adminSetOptInState(formData: FormData) {
  const admin = await getAdminClient()
  const id = String(formData.get('id') ?? '')
  const username = normalizeUsername(String(formData.get('username') ?? ''))
  const twitterUserId = String(formData.get('twitter_user_id') ?? '')
  const state = String(formData.get('state') ?? '')

  if (!username) throw new Error('Missing username')

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

  if (!update) throw new Error('Unsupported opt-in state')

  const existingResponse = id
    ? null
    : await admin
        .from('optin')
        .select('id')
        .eq('username', username)
        .maybeSingle()
  if (existingResponse?.error) throw existingResponse.error

  const recordId = id || existingResponse?.data?.id
  const response = recordId
    ? await admin.from('optin').update(update).eq('id', recordId)
    : await admin.from('optin').insert({ ...update, user_id: null })
  if (response.error) throw response.error

  if (state === 'opted-in') {
    await deleteScrapeBlock(admin, twitterUserId)
  }

  revalidatePath('/admin')
}

export async function adminOptOutAccount(formData: FormData) {
  const admin = await getAdminClient()
  const id = String(formData.get('id') ?? '')
  const username = normalizeUsername(String(formData.get('username') ?? ''))
  const twitterUserId = String(formData.get('twitter_user_id') ?? '')
  const reason =
    String(formData.get('reason') ?? '').trim() || 'Admin manual opt-out'
  const deleteData = String(formData.get('delete_data') ?? '') === 'true'

  if (!username) throw new Error('Missing username')

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

  const optOutResponse = id
    ? await admin.from('optin').update(optOutUpdate).eq('id', id)
    : await admin
        .from('optin')
        .upsert({ ...optOutUpdate, user_id: null }, { onConflict: 'username' })
  if (optOutResponse.error) throw optOutResponse.error

  if (deleteData) {
    if (!twitterUserId) throw new Error('Missing Twitter account id for delete')
    const deleteResponse = await admin.rpc('delete_user_archive', {
      p_account_id: twitterUserId,
    })
    if (deleteResponse.error) throw deleteResponse.error
    await deleteStorageFiles(admin, username)
  }

  revalidatePath('/admin')
}

export async function setScrapeBlock(formData: FormData) {
  const admin = await getAdminClient()
  const accountId = String(formData.get('account_id') ?? '')
  const blocked = String(formData.get('blocked') ?? '') === 'true'
  if (!accountId) throw new Error('Missing account id')

  if (blocked) {
    await upsertScrapeBlock(admin, accountId)
  } else {
    await deleteScrapeBlock(admin, accountId)
  }

  revalidatePath('/admin')
}
