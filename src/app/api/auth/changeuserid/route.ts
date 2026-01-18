import { NextRequest, NextResponse } from 'next/server'
import { createServerAdminClient, createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { devLog } from '@/lib/devLog'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const adminSupabase = createServerAdminClient(cookieStore)

  // Verify the user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse request body with error handling
  let body: { userId?: string; providerId?: string; userName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { userId, providerId, userName } = body

  // Validate required fields
  if (!userId || !providerId || !userName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // SECURITY: Users can only modify their own record
  if (user.id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const lowerUserName = userName.toLowerCase()

  const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
    app_metadata: { provider_id: providerId, user_name: lowerUserName },
    user_metadata: { provider_id: providerId, user_name: lowerUserName },
  })

  devLog('changeuserid', { error })
  if (error) {
    console.error('Failed to update user metadata:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
