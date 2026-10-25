import { timingSafeEqual } from 'node:crypto'
import { isReadRpc } from '@/utils/supabaseReadPolicy'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

/** Authenticated server bridge. Production receives GET/HEAD only, never a write. */
export async function POST(request: Request) {
  const secret = process.env.PUBLIC_READ_SECRET
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (
    process.env.VERCEL_ENV !== 'production' ||
    process.env.DATA_READ_SOURCE === 'production' ||
    !secret ||
    secret.length < 32 ||
    !token ||
    Buffer.byteLength(token) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  )
    return new Response(null, { status: 404, headers })
  let body
  try {
    const text = await request.text()
    if (Buffer.byteLength(text) > 64_000)
      return new Response(null, { status: 413, headers })
    body = JSON.parse(text)
  } catch {
    return new Response(null, { status: 400, headers })
  }
  if (
    !body ||
    body.operation !== 'read' ||
    typeof body.path !== 'string' ||
    !['GET', 'HEAD'].includes(body.method) ||
    !['anon', 'service_role'].includes(body.role)
  )
    return new Response(null, { status: 400, headers })
  try {
    const origin = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key =
      body.role === 'anon'
        ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        : process.env.SUPABASE_SERVICE_ROLE
    if (!origin || !key) throw new Error('Read source unavailable')
    const url = new URL(body.path, origin)
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1]
    const table = /^\/rest\/v1\/[a-zA-Z0-9_]+$/.test(url.pathname)
    // Original archives and auth records are never part of this bridge.
    const displayFile =
      /^\/storage\/v1\/object\/(?:authenticated\/)?(?:community-app-data|community-project-covers)\/[a-zA-Z0-9_./-]+$/.test(
        url.pathname,
      )
    if (
      !body.path.startsWith('/') ||
      url.origin !== new URL(origin).origin ||
      url.hash ||
      !(table || (rpc && isReadRpc(rpc)) || displayFile)
    )
      return new Response(null, { status: 400, headers })
    const upstreamHeaders = new Headers({
      apikey: key,
      Authorization: `Bearer ${key}`,
    })
    const incoming = new Headers(body.headers)
    const schema = incoming.get('accept-profile')
    if (schema && !['public', 'tes', 'dev'].includes(schema))
      return new Response(null, { status: 400, headers })
    for (const name of ['accept', 'accept-profile', 'range', 'range-unit']) {
      const value = incoming.get(name)
      if (value) upstreamHeaders.set(name, value)
    }
    const prefer = incoming
      .get('prefer')
      ?.split(',')
      .map((value) => value.trim())
      .filter((value) => /^count=(exact|planned|estimated)$/.test(value))
      .join(',')
    if (prefer) upstreamHeaders.set('prefer', prefer)
    // PostgREST enforces READ ONLY transactions for GET/HEAD, including RPCs.
    const response = await fetch(url, {
      method: body.method,
      headers: upstreamHeaders,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    const responseHeaders = new Headers(headers)
    for (const name of ['content-type', 'content-range', 'range-unit']) {
      const value = response.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch {
    return NextResponse.json(
      { message: 'Production read unavailable' },
      { status: 503, headers },
    )
  }
}
