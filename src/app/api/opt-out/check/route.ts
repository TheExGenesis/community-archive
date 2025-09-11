import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  // Get username from query params
  const searchParams = request.nextUrl.searchParams
  const username = searchParams.get('username')

  if (!username) {
    return NextResponse.json({ error: 'Username required' }, { status: 400 })
  }

  // Check if user is on the opt-out list
  const { data: optOutData, error: optOutError } = await supabase
    .from('optout')
    .select('username, opted_out')
    .eq('username', username)
    .eq('opted_out', true)
    .single()

  // Check if user is on the opt-in list with explicit opt-out
  const { data: optInData, error: optInError } = await supabase
    .from('optin')
    .select('username, explicit_optout')
    .eq('username', username)
    .eq('explicit_optout', true)
    .single()

  const isOptedOut = !!optOutData || (optInData?.explicit_optout === true)

  return NextResponse.json({ 
    username,
    isOptedOut,
    inOptOutTable: !!optOutData,
    hasExplicitOptOut: optInData?.explicit_optout === true
  })
}