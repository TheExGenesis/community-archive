import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('optout')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ optedOut: data?.opted_out || false, data })
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { opted_out, reason } = body

  // Get user's email for username
  const username = user.email?.split('@')[0] || 'unknown'

  const { data, error } = await supabase
    .from('optout')
    .upsert({
      user_id: user.id,
      username,
      opted_out,
      reason
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also update opt-in table if opting out
  if (opted_out) {
    await supabase
      .from('optin')
      .update({ opted_in: false, explicit_optout: true })
      .eq('user_id', user.id)
  }

  return NextResponse.json({ success: true, data })
}

export async function DELETE(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('optout')
    .delete()
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update opt-in table
  await supabase
    .from('optin')
    .update({ explicit_optout: false })
    .eq('user_id', user.id)

  return NextResponse.json({ success: true })
}