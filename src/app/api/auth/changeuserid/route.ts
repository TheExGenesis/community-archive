import { NextRequest, NextResponse } from 'next/server'
import { createServerAdminClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const supabase = createServerAdminClient(cookies())
  const { userId, providerId } = await request.json()

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { provider_id: providerId },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
