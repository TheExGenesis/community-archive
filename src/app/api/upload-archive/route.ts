import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'
import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'
import { processTwitterArchive } from '@/lib-server/db_insert'

export async function POST(request: Request) {
  console.log('POST ARCHIVE RECEIVED')
  const content = await request.json()
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)

  try {
    console.log(content)
    processTwitterArchive(content)

    return NextResponse.json({
      success: true,
      message: 'Tweets uploaded and processed successfully',
    })
  } catch (error) {
    console.error('Error processing tweets:', error)
    return NextResponse.json(
      { success: false, message: 'Error processing tweets' },
      { status: 500 },
    )
  }
}
