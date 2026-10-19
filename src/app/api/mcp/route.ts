import { NextResponse } from 'next/server'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { createArchiveMcpServer } from '@/lib/mcp/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const handler = createMcpHandler(createArchiveMcpServer, {
  responseMode: 'json',
})

async function handleRequest(request: Request) {
  const origin = request.headers.get('origin')
  const url = new URL(request.url)
  const host = request.headers.get('host') ?? url.host
  if (origin !== null && origin !== `${url.protocol}//${host}`) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  const response = await handler.fetch(request)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export { handleRequest as POST, handleRequest as GET, handleRequest as DELETE }
