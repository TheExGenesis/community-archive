import 'server-only'

import { checkBotId } from 'botid/server'
import { NextResponse } from 'next/server'

/**
 * Reject unverified automation before an expensive analytical read runs.
 *
 * BotID is only meaningful on Vercel production requests. Development and
 * tests remain unchanged, and a BotID service/configuration failure fails open
 * so protection cannot take the site offline.
 */
export async function enforceBotId(): Promise<NextResponse | null> {
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.VERCEL_ENV !== 'production'
  ) {
    return null
  }

  try {
    const result = await checkBotId({
      advancedOptions: { checkLevel: 'basic' },
    })

    if (result.isBot && !result.isVerifiedBot) {
      return NextResponse.json(
        { error: 'Automated requests are not allowed' },
        {
          status: 403,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      )
    }
  } catch (error) {
    console.error('BotID verification failed open:', error)
  }

  return null
}
