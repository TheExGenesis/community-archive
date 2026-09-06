import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const USERNAME = /^[A-Za-z0-9_]{1,15}$/

export async function GET(
  _request: NextRequest,
  { params }: { params: { username: string } },
) {
  const username = params.username.toLowerCase()
  if (!USERNAME.test(username)) {
    return NextResponse.json({ error: 'Archive not found' }, { status: 404 })
  }

  const supabase = createServerClient(await cookies())
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  const sessionUsername = user ? getSessionTwitterUsername(user) : null
  const providerId = user?.app_metadata?.provider_id
  if (
    authError ||
    !user ||
    sessionUsername !== username ||
    typeof providerId !== 'string' ||
    !providerId.trim()
  ) {
    return NextResponse.json({ error: 'Archive not found' }, { status: 404 })
  }

  const { error: policyError } = await supabase.rpc(
    'assert_archive_upload_allowed',
    { p_account_id: providerId, p_username: username },
  )
  if (policyError) {
    return NextResponse.json({ error: 'Archive not found' }, { status: 404 })
  }

  const { data, error } = await supabase.storage
    .from('archives')
    .createSignedUrl(`${username}/archive.json`, 60)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Archive not found' }, { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl)
}
