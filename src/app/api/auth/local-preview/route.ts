import { NextRequest, NextResponse } from 'next/server'
import {
  LOCAL_ADMIN_COOKIE,
  localAdminPreviewAllowed,
} from '@/lib/localAdminPreview'
export async function POST(request: NextRequest) {
  if (!localAdminPreviewAllowed(request.headers.get('host')))
    return new NextResponse('Not Found', { status: 404 })
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return new NextResponse('Forbidden', { status: 403 })
  const { enabled } = await request.json().catch(() => ({}))
  if (typeof enabled !== 'boolean')
    return new NextResponse('Invalid preview state', { status: 400 })
  const response = NextResponse.json(
    { enabled },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
  response.cookies.set(LOCAL_ADMIN_COOKIE, enabled ? 'admin' : 'signed-out', {
    httpOnly: true,
    sameSite: 'strict',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  if (!enabled) {
    response.cookies.delete('dev_as_member')
    response.cookies.delete('birdseye-share')
  }
  return response
}
