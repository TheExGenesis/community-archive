import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase'
import { loginHref } from '@/lib/authRedirect'

// Shared within a server render, including profile metadata and page content.
export const getBrowsingUser = cache(async () => {
  try {
    const client = createServerClient(await cookies())
    const { data, error } = await client.auth.getUser()
    return error ? null : data.user
  } catch {
    return null
  }
})

export async function requireBrowsingUser(returnTo: string) {
  if (!(await getBrowsingUser())) redirect(loginHref(returnTo))
}

export async function browsingAuthError() {
  if (await getBrowsingUser()) return null
  return NextResponse.json(
    { error: 'Authentication required' },
    { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
