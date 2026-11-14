import { NextResponse, type NextRequest } from 'next/server'
import {
  getSpreadAnchors,
  getSpreadMeta,
  getSpreadVocab,
  getSpreadWord,
} from '@/lib/spreadExplorer/data'
import { normalizeWord, parseHandles } from '@/lib/spreadExplorer/tokens'

export const dynamic = 'force-dynamic'

// The explorer is open to anyone with the link, and its data is a static
// export that changes only when a new one is uploaded. Successful answers are
// therefore cached by the edge for a day, so repeat and automated requests
// do not reach this function or Supabase Storage.
const CACHED = {
  'Cache-Control':
    'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
  'X-Robots-Tag': 'noindex, nofollow',
}
const UNCACHED = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: status === 200 ? CACHED : UNCACHED,
  })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
) {
  const { resource } = await params
  const query = request.nextUrl.searchParams
  try {
    switch (resource) {
      case 'meta':
        return json(await getSpreadMeta())
      case 'vocab':
        return json(await getSpreadVocab())
      case 'word': {
        const token = normalizeWord(query.get('w'))
        if (!token) return json({ error: 'give one word' }, 400)
        return json(await getSpreadWord(token))
      }
      case 'anchors':
        return json({
          anchors: await getSpreadAnchors(parseHandles(query.get('handles'))),
        })
      default:
        return new NextResponse('Not Found', { status: 404, headers: UNCACHED })
    }
  } catch (error) {
    console.error('[spread-explorer]', resource, error)
    return json({ error: 'Spread explorer data is unavailable' }, 502)
  }
}
