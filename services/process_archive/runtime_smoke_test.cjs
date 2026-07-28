const assert = require('node:assert/strict')
const { createClient } = require('@supabase/supabase-js')

assert.equal(
  typeof WebSocket,
  'function',
  'The archive worker runtime must provide a native WebSocket implementation',
)
assert.equal(
  typeof global.gc,
  'function',
  'The archive worker must start Node.js with --expose-gc',
)

const client = createClient(
  'https://runtime-smoke-test.supabase.co',
  'runtime-smoke-test-key',
  {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  },
)

assert.ok(client.storage, 'The Supabase Storage client must initialize')
console.log(`Archive worker runtime smoke test passed on ${process.version}`)
