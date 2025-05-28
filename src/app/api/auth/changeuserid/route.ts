import { NextRequest, NextResponse } from 'next/server'
import { createServerAdminClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { devLog } from '@/lib/devLog'

export async function POST(request: NextRequest) {
  const supabase = createServerAdminClient(cookies())
  const { userId, providerId, userName } = await request.json()
  const lowerUserName = userName.toLowerCase()

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { provider_id: providerId, user_name: lowerUserName },
    user_metadata: { provider_id: providerId, user_name: lowerUserName },
  })

  devLog('changeuserid', { error })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
