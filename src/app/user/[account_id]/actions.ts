'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import {
  createServerClient,
  createServerServiceRoleClient,
} from '@/utils/supabase'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import type { ProfileCurationSection } from '@/lib/profileCurationState'

const idPattern = /^\d{1,20}$/
const MAX_REORDER_ITEMS = 100

interface CurationTarget {
  accountId: string
  section: ProfileCurationSection
}

type ProfileCurationMutation =
  | (CurationTarget & { action: 'add'; itemId: string })
  | (CurationTarget & { action: 'dismiss'; itemId: string })
  | (CurationTarget & { action: 'restore-item'; itemId: string })
  | (CurationTarget & { action: 'toggle-feature'; itemId: string })
  | (CurationTarget & { action: 'reorder'; itemIds: string[] })
  | (CurationTarget & { action: 'restore' })

function validateTarget(input: CurationTarget) {
  if (!idPattern.test(input.accountId)) throw new Error('Invalid profile')
  if (input.section !== 'bangers' && input.section !== 'people') {
    throw new Error('Invalid profile section')
  }
}

async function authenticatedAccount() {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  const ownedAccountId = user?.app_metadata?.provider_id

  if (error || !user || typeof ownedAccountId !== 'string') {
    throw new Error('Sign in with X to edit your profile')
  }
  if (!idPattern.test(ownedAccountId)) {
    throw new Error('Your X account could not be verified')
  }

  return {
    accountId: ownedAccountId,
    // The identity above comes from the authoritative Auth user. Perform the
    // write with the server credential so a just-updated OAuth JWT cannot make
    // an otherwise valid first-session edit fail RLS.
    supabase: createServerServiceRoleClient(),
  }
}

async function authenticatedOwner(accountId: string) {
  const authenticated = await authenticatedAccount()
  if (authenticated.accountId !== accountId) {
    throw new Error('You can only edit your own profile')
  }
  return authenticated.supabase
}

function revalidateProfile(accountId: string) {
  revalidatePath(`/user/${accountId}`)
  revalidatePath(`/api/profile/${accountId}/bangers`)
  revalidatePath(`/api/profile/${accountId}/interactions`)
}

async function addOwnedProfileTweet(
  accountId: string,
  itemId: string,
  supabase: ReturnType<typeof createServerServiceRoleClient>,
) {
  if (!idPattern.test(itemId)) throw new Error('Invalid tweet')

  const tweet = await fetchClickHouseTweetPageData(itemId)
  if (!tweet) throw new Error('That tweet is not in Community Archive yet')
  if (tweet.account_id !== accountId) {
    throw new Error('You can only add your own tweets to your profile')
  }

  const { error } = await supabase.from('profile_curation').upsert(
    {
      account_id: accountId,
      section: 'bangers',
      item_id: itemId,
      is_hidden: false,
      is_featured: true,
      position: 0,
    },
    { onConflict: 'account_id,section,item_id' },
  )
  if (error) throw error
  revalidateProfile(accountId)
  return { ok: true as const, accountId }
}

export async function addTweetToOwnProfile(itemId: string) {
  const authenticated = await authenticatedAccount()
  return addOwnedProfileTweet(
    authenticated.accountId,
    itemId,
    authenticated.supabase,
  )
}

export async function mutateProfileCuration(input: ProfileCurationMutation) {
  validateTarget(input)
  const supabase = await authenticatedOwner(input.accountId)
  const target = {
    account_id: input.accountId,
    section: input.section,
  }

  if (input.action === 'add') {
    if (input.section !== 'bangers') {
      throw new Error('Only tweets can be added to a profile')
    }
    return addOwnedProfileTweet(input.accountId, input.itemId, supabase)
  }

  if (input.action === 'restore') {
    const { error } = await supabase
      .from('profile_curation')
      .delete()
      .match(target)
    if (error) throw error
    revalidateProfile(input.accountId)
    return { ok: true as const }
  }

  if (input.action === 'reorder') {
    if (
      input.itemIds.length === 0 ||
      input.itemIds.length > MAX_REORDER_ITEMS ||
      new Set(input.itemIds).size !== input.itemIds.length ||
      input.itemIds.some((id) => !idPattern.test(id))
    ) {
      throw new Error('Invalid profile order')
    }
    const { error } = await supabase.from('profile_curation').upsert(
      input.itemIds.map((itemId, position) => ({
        ...target,
        item_id: itemId,
        position,
      })),
      { onConflict: 'account_id,section,item_id' },
    )
    if (error) throw error
    revalidateProfile(input.accountId)
    return { ok: true as const }
  }

  if (!idPattern.test(input.itemId)) throw new Error('Invalid profile item')

  if (input.action === 'restore-item') {
    const { error } = await supabase
      .from('profile_curation')
      .upsert(
        { ...target, item_id: input.itemId, is_hidden: false },
        { onConflict: 'account_id,section,item_id' },
      )
    if (error) throw error
    revalidateProfile(input.accountId)
    return { ok: true as const }
  }

  if (input.action === 'dismiss') {
    const { error } = await supabase
      .from('profile_curation')
      .upsert(
        { ...target, item_id: input.itemId, is_hidden: true },
        { onConflict: 'account_id,section,item_id' },
      )
    if (error) throw error
    revalidateProfile(input.accountId)
    return { ok: true as const }
  }

  const { data: current, error: readError } = await supabase
    .from('profile_curation')
    .select('is_featured')
    .match({ ...target, item_id: input.itemId })
    .maybeSingle()
  if (readError) throw readError
  const isFeatured = !current?.is_featured
  const { error } = await supabase
    .from('profile_curation')
    .upsert(
      { ...target, item_id: input.itemId, is_featured: isFeatured },
      { onConflict: 'account_id,section,item_id' },
    )
  if (error) throw error
  revalidateProfile(input.accountId)
  return { ok: true as const, isFeatured }
}

export async function updateDownloadArchiveVisibility(
  accountId: string,
  visible: boolean,
) {
  if (!idPattern.test(accountId) || typeof visible !== 'boolean') {
    throw new Error('Invalid profile setting')
  }
  const supabase = await authenticatedOwner(accountId)
  const { error } = await supabase.from('profile_settings').upsert(
    {
      account_id: accountId,
      download_archive_visible: visible,
    },
    { onConflict: 'account_id' },
  )
  if (error) throw error
  revalidateProfile(accountId)
  revalidatePath('/settings')
  return { ok: true as const }
}
