'use server'

import { requireAdmin } from '@/app/admin/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
import {
  directoryVisibilityKey,
  getHiddenDirectoryUsers,
} from '@/lib/directoryVisibility'
import { getUserDirectoryPage } from '@/lib/userDirectory'
import { revalidatePath } from 'next/cache'

export async function listHiddenDirectoryUsers() {
  await requireAdmin()
  return getHiddenDirectoryUsers()
}

export async function hideDirectoryUser(directoryId: string, username: string) {
  const { user: admin } = await requireAdmin()
  if (
    typeof directoryId !== 'string' ||
    directoryId.length > 100 ||
    typeof username !== 'string' ||
    !/^[a-zA-Z0-9_]{1,15}$/.test(username)
  ) {
    throw new Error('Invalid directory user')
  }
  // Resolve the submitted identity from the source before saving it. The
  // empty hidden list allows an idempotent retry for an already hidden row.
  const page = await getUserDirectoryPage(
    new URLSearchParams({ search: username, limit: '100' }),
    undefined,
    Promise.resolve([]),
  )
  const target = page.users.find(
    (row) =>
      row.directory_id === directoryId &&
      row.username.toLowerCase() === username.toLowerCase(),
  )
  if (!target)
    throw new Error('Directory user not found; refresh and try again')
  const client = createServerServiceRoleClient({
    noStore: true,
    readSource: 'app',
  })
  const { error } = await client.from('directory_hidden_users').upsert({
    visibility_key: directoryVisibilityKey(target),
    account_id: target.account_id,
    username: target.username.toLowerCase(),
    hidden_by: admin.id,
    hidden_at: new Date().toISOString(),
  })
  if (error) throw new Error('Could not hide this user. Please try again.')
  revalidatePath('/user-dir')
}

export async function restoreDirectoryUser(visibilityKey: string) {
  await requireAdmin()
  if (
    typeof visibilityKey !== 'string' ||
    !/^(id:[0-9]{1,20}|username:[a-z0-9_]{1,15})$/.test(visibilityKey)
  ) {
    throw new Error('Invalid directory user')
  }
  const client = createServerServiceRoleClient({
    noStore: true,
    readSource: 'app',
  })
  const { error } = await client
    .from('directory_hidden_users')
    .delete()
    .eq('visibility_key', visibilityKey)
  if (error) throw new Error('Could not restore this user. Please try again.')
  revalidatePath('/user-dir')
}
