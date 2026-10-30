import { NextResponse, type NextRequest } from 'next/server'
import { checkIsAdmin } from '@/app/admin/data'
import {
  getSpreadAnchors,
  getSpreadMeta,
  getSpreadVocab,
  getSpreadWord,
} from '@/lib/spreadExplorer/data'
import { normalizeWord, parseHandles } from '@/lib/spreadExplorer/tokens'

export const dynamic = 'force-dynamic'

// Everything here names real accounts (central accounts per hex, anchors), so
// the response is private to the admin session and never cached by the edge.
const HEADERS = { 'Cache-Control': 'private, no-store' }

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: HEADERS })

export async function GET(
  request: NextRequest,
  { params }: { params: { resource: string } },
) {
  // Same identity gate as /admin; a non-admin sees the same 404 as for a route that does not exist.
  if (!(await checkIsAdmin())) {
    return new NextResponse('Not Found', { status: 404, headers: HEADERS })
  }
  const query = request.nextUrl.searchParams
  try {
    switch (params.resource) {
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
        return new NextResponse('Not Found', { status: 404, headers: HEADERS })
    }
  } catch (error) {
    console.error('[spread-explorer]', params.resource, error)
    return json({ error: 'Spread explorer data is unavailable' }, 502)
  }
}
