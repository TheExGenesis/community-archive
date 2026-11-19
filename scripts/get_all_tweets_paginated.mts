// Fetch every archived tweet of one account through the keyed API v1.
//
//   CA_API_KEY=cak_... pnpm script scripts/get_all_tweets_paginated.mts <username or account id>
//
// Create a key at https://www.community-archive.org/settings/api-keys. The
// anonymous Supabase REST API this script used before was retired on
// 2026-11-19. Pages follow next_cursor until it is null; a short page is not
// the end.

const API = 'https://analytics.community-archive.org/v1'
const key = process.env.CA_API_KEY
const account = process.argv[2] ?? 'exgenesis'
if (!key) {
  console.error('Set CA_API_KEY to a personal API v1 key.')
  process.exit(2)
}

const tweets: unknown[] = []
let cursor: string | null = null
do {
  const url = new URL(`${API}/accounts/${encodeURIComponent(account)}/tweets`)
  url.searchParams.set('order', 'asc')
  url.searchParams.set('limit', '200')
  if (cursor) url.searchParams.set('cursor', cursor)

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (response.status === 429 || response.status === 503) {
    const wait = Number(response.headers.get('Retry-After') ?? '5')
    await new Promise((resolve) => setTimeout(resolve, wait * 1000))
    continue
  }
  if (!response.ok)
    throw new Error(`${response.status} ${await response.text()}`)

  const page = (await response.json()) as {
    data: unknown[]
    next_cursor: string | null
  }
  tweets.push(...page.data)
  cursor = page.next_cursor
} while (cursor)

console.log('Total tweets fetched:', tweets.length)
console.log(JSON.stringify(tweets, null, 2))
