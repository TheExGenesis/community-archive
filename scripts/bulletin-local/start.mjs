// One command for a local /opportunities that needs no Supabase auth, no
// ClickHouse gateway credentials and no model key:
//
//   pnpm dev:bulletin-local              # http://127.0.0.1:3105/opportunities
//   PORT=3000 pnpm dev:bulletin-local    # pick the Next port
//
// It starts server.mjs (board state + gateway mock) and `next dev` with the
// environment below. Values here override .env / .env.local for this process
// only; nothing points at a remote database. The page renders as the loopback
// admin preview (LOCAL_ADMIN_PREVIEW), so there is no session: the "you"
// identity for badges and Recommended comes from BULLETIN_LOCAL_PREVIEW_*.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const mockPort = process.env.BULLETIN_LOCAL_MOCK_PORT || '4785'
const port = process.env.PORT || '3105'
const fixtures = JSON.parse(
  readFileSync(resolve(here, 'fixtures.json'), 'utf8'),
)

const forced = {
  NODE_ENV: 'development',
  LOCAL_ADMIN_PREVIEW: 'true',
  NEXT_PUBLIC_USE_REMOTE_DEV_DB: 'false',
  BULLETIN_LOCAL_MOCK_PORT: mockPort,
  BULLETIN_LOCAL_BOARD_PREVIEW_URL: `http://127.0.0.1:${mockPort}/board`,
  BULLETIN_LOCAL_RUN_PREVIEW_URL: `http://127.0.0.1:${mockPort}/runs`,
  BULLETIN_LOCAL_RELATIONSHIPS_URL: `http://127.0.0.1:${mockPort}/relationships`,
  CLICKHOUSE_ANALYTICS_API_URL: `http://127.0.0.1:${mockPort}/gateway`,
  CLICKHOUSE_SEARCH_API_URL: `http://127.0.0.1:${mockPort}/gateway`,
  CLICKHOUSE_ANALYTICS_API_TOKEN: 'local-preview-token',
  BULLETIN_LOCAL_PREVIEW_ACCOUNT_ID: fixtures.me.account_id,
  BULLETIN_LOCAL_PREVIEW_USERNAME: fixtures.me.username,
}
// Placeholders so Supabase client construction does not throw. With
// NEXT_PUBLIC_USE_REMOTE_DEV_DB=false only the *_LOCAL_* values are read, and
// nothing on the bulletin path calls them under LOCAL_ADMIN_PREVIEW.
const defaults = {
  NEXT_PUBLIC_LOCAL_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_LOCAL_ANON_KEY: 'local-preview-anon-key',
  NEXT_PUBLIC_LOCAL_SERVICE_ROLE: 'local-preview-service-role',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-preview-anon-key',
}
const env = { ...defaults, ...process.env, ...forced }

const children = []
function run(label, args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: 'inherit',
  })
  child.on('exit', (code) => {
    console.log(`[${label}] exited with ${code ?? 'signal'}`)
    shutdown(code ?? 0)
  })
  children.push(child)
  return child
}
let closing = false
function shutdown(code) {
  if (closing) return
  closing = true
  for (const child of children)
    if (child.exitCode === null) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 200).unref()
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

run('mock', [resolve(here, 'server.mjs')])
run('next', [
  resolve(root, 'node_modules/next/dist/bin/next'),
  'dev',
  '--hostname',
  '127.0.0.1',
  '--port',
  port,
])
console.log(
  `\nBulletin local preview: http://127.0.0.1:${port}/opportunities  (viewer @${fixtures.me.username}, mock on 127.0.0.1:${mockPort})\n`,
)
