/**
 * Remove all data for users who have explicitly opted out, and add them to
 * the scraping blocklist (tes.blocked_scraping_users) so their tweets aren't
 * picked up again.
 *
 * For each username:
 *   1. Look up account in all_account (case-insensitive)
 *   2. Show what will be deleted (DB row counts + sample tweets + storage)
 *   3. Prompt to type the username back to confirm
 *   4. UPSERT tes.blocked_scraping_users(account_id)  ← block first, race-safe
 *   5. Call public.delete_user_archive(account_id) as service_role
 *   6. Delete any files under archives/<username>/ in Storage
 *   7. Verify block row exists and data rows are 0
 *
 * Usage:
 *   pnpm tsx scripts/remove_user_data.mts <username> [<username> ...]
 *
 * Flags:
 *   --local      target the local Supabase instead of prod (default: prod)
 *   --yes-really skip interactive per-user confirmation (use with extreme care;
 *                still shows a 5-second abort window per user)
 *   --no-block   skip the blocklist upsert (DELETION ONLY — not recommended
 *                for opt-out requests; use only if blocking is handled elsewhere)
 */
import { fileURLToPath } from 'url'
import path from 'path'
import * as readline from 'readline/promises'
import { stdin as input, stdout as output } from 'process'
import * as dotenv from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '../src/database-types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

// ---- args ----
const argv = process.argv.slice(2)
const useLocal = argv.includes('--local')
const skipPrompt = argv.includes('--yes-really')
const skipBlock = argv.includes('--no-block')
const usernames = argv.filter((a) => !a.startsWith('--'))

if (usernames.length === 0) {
  console.error(
    'Usage: pnpm tsx scripts/remove_user_data.mts [--local] [--yes-really] <username> [<username> ...]',
  )
  process.exit(1)
}

const isProd = !useLocal
const supabaseUrl = isProd
  ? process.env.NEXT_PUBLIC_SUPABASE_URL
  : process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL
const supabaseServiceRoleKey = isProd
  ? process.env.SUPABASE_SERVICE_ROLE
  : process.env.NEXT_PUBLIC_LOCAL_SERVICE_ROLE

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase URL or service role key in .env.local')
  process.exit(1)
}

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type Counts = {
  all_account: number
  all_profile: number
  archive_upload: number
  tweets: number
  likes: number
  followers: number
  following: number
}

async function countsFor(
  client: SupabaseClient<Database>,
  accountId: string,
): Promise<Counts> {
  const [acct, prof, uploads, tweets, likes, followers, following] =
    await Promise.all([
      client.from('all_account').select('*', { count: 'exact', head: true }).eq('account_id', accountId),
      client.from('all_profile').select('*', { count: 'exact', head: true }).eq('account_id', accountId),
      client.from('archive_upload').select('*', { count: 'exact', head: true }).eq('account_id', accountId),
      client.from('tweets').select('*', { count: 'exact', head: true }).eq('account_id', accountId),
      client.from('likes').select('*', { count: 'exact', head: true }).eq('account_id', accountId),
      client.from('followers').select('*', { count: 'exact', head: true }).eq('account_id', accountId),
      client.from('following').select('*', { count: 'exact', head: true }).eq('account_id', accountId),
    ])
  return {
    all_account: acct.count ?? 0,
    all_profile: prof.count ?? 0,
    archive_upload: uploads.count ?? 0,
    tweets: tweets.count ?? 0,
    likes: likes.count ?? 0,
    followers: followers.count ?? 0,
    following: following.count ?? 0,
  }
}

async function lookupAccount(usernameLower: string) {
  const { data, error } = await supabase
    .from('all_account')
    .select('account_id, username, account_display_name, num_tweets, created_via, created_at')
    .ilike('username', usernameLower)
  if (error) throw new Error(`all_account lookup failed: ${error.message}`)
  return data ?? []
}

async function sampleTweets(accountId: string) {
  const { data } = await supabase
    .from('tweets')
    .select('tweet_id, created_at, full_text, archive_upload_id')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(3)
  return data ?? []
}

async function storageFiles(usernameLower: string) {
  const { data, error } = await supabase.storage.from('archives').list(usernameLower)
  if (error) throw new Error(`storage list failed: ${error.message}`)
  return data ?? []
}

async function confirmWithUsername(rl: readline.Interface, expected: string) {
  try {
    const answer = (await rl.question(
      `  Type "${expected}" to confirm deletion (anything else skips): `,
    )).trim()
    return answer === expected
  } catch (err: any) {
    // stdin closed / piped input exhausted → treat as "skip" rather than crash
    if (err?.code === 'ERR_USE_AFTER_CLOSE' || err?.code === 'ABORT_ERR') {
      console.log(`  (stdin closed — treating as skip)`)
      return false
    }
    throw err
  }
}

async function abortableCountdown(seconds: number) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r  Deleting in ${i}s... (Ctrl-C to abort)   `)
    await new Promise((r) => setTimeout(r, 1000))
  }
  process.stdout.write('\r' + ' '.repeat(50) + '\r')
}

async function processOne(rl: readline.Interface, rawUsername: string) {
  const username = rawUsername.toLowerCase().replace(/^@/, '')
  console.log(`\n────────────────────────────────────────────────────────`)
  console.log(`Username: ${username}   (${isProd ? 'PROD' : 'LOCAL'})`)
  console.log(`────────────────────────────────────────────────────────`)

  const accounts = await lookupAccount(username)
  const files = await storageFiles(username)

  if (accounts.length === 0 && files.length === 0) {
    console.log(`  No all_account row and no storage files. Nothing to do.`)
    return { username, outcome: 'nothing-to-do' as const }
  }

  if (accounts.length > 1) {
    console.log(`  ⚠️  ${accounts.length} account rows matched — refusing to proceed.`)
    console.table(accounts)
    return { username, outcome: 'ambiguous' as const }
  }

  const account = accounts[0]
  if (account) {
    console.log(`  account_id:    ${account.account_id}`)
    console.log(`  display name:  ${account.account_display_name}`)
    console.log(`  created_via:   ${account.created_via}   created_at: ${account.created_at}`)
    console.log(`  num_tweets (profile metadata): ${account.num_tweets}`)

    const before = await countsFor(supabase, account.account_id)
    console.log(`  DB row counts:`)
    console.table(before)

    const sample = await sampleTweets(account.account_id)
    if (sample.length > 0) {
      console.log(`  Sample of most recent tweets (sanity check):`)
      for (const t of sample) {
        const preview = (t.full_text || '').slice(0, 90).replace(/\s+/g, ' ')
        console.log(`    ${t.tweet_id}  ${t.created_at}  "${preview}"`)
      }
    }
  } else {
    console.log(`  No all_account row, but storage dir exists.`)
  }

  console.log(`  Storage archives/${username}/: ${files.length} file(s)`)
  if (files.length > 0) {
    for (const f of files) console.log(`    ${f.name}  ${f.metadata?.size ?? ''}`)
  }

  // Confirmation gate
  if (!skipPrompt) {
    const ok = await confirmWithUsername(rl, username)
    if (!ok) {
      console.log(`  ⏭  Skipped.`)
      return { username, outcome: 'skipped' as const }
    }
  } else {
    await abortableCountdown(5)
  }

  // Block FIRST so the scraper can't re-pick them up between delete and block.
  if (account && !skipBlock) {
    const { error: blockErr } = await supabase
      .schema('tes')
      .from('blocked_scraping_users')
      .upsert({ account_id: account.account_id }, { onConflict: 'account_id' })
    if (blockErr) {
      console.error(`  ✗ Blocklist upsert failed: ${blockErr.message}`)
      return { username, outcome: 'block-failed' as const, error: blockErr.message }
    }
    console.log(`  ✓ Added to tes.blocked_scraping_users`)
  } else if (!account) {
    console.log(
      `  ⚠️  No account_id found — can't add to blocklist. (Opt-out requires a known account_id.)`,
    )
  }

  // DB delete (if account exists)
  if (account) {
    console.log(`  → Calling delete_user_archive(${account.account_id})...`)
    const start = Date.now()
    // @ts-expect-error typed RPC in generated types
    const { error } = await supabase.rpc('delete_user_archive', {
      p_account_id: account.account_id,
    })
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    if (error) {
      console.error(`  ✗ RPC failed after ${elapsed}s: ${error.message}`)
      return { username, outcome: 'db-failed' as const, error: error.message }
    }
    console.log(`  ✓ RPC OK in ${elapsed}s`)
  }

  // Storage delete
  if (files.length > 0) {
    const paths = files.map((f) => `${username}/${f.name}`)
    const { error } = await supabase.storage.from('archives').remove(paths)
    if (error) {
      console.error(`  ✗ Storage delete failed: ${error.message}`)
      return { username, outcome: 'storage-failed' as const, error: error.message }
    }
    console.log(`  ✓ Removed ${paths.length} storage file(s)`)
  }

  // Verify
  if (account) {
    const after = await countsFor(supabase, account.account_id)
    const allZero = Object.values(after).every((v) => v === 0)
    const remainingFiles = await storageFiles(username)
    const storageEmpty = remainingFiles.length === 0
    console.log(`  Verification — DB counts:`)
    console.table(after)
    console.log(`  Verification — storage: ${remainingFiles.length} file(s)`)

    // Confirm blocklist row is present
    let blocklisted: boolean | null = null
    if (!skipBlock) {
      const { data: blockRow } = await supabase
        .schema('tes')
        .from('blocked_scraping_users')
        .select('account_id, updated_at')
        .eq('account_id', account.account_id)
        .maybeSingle()
      blocklisted = !!blockRow
      console.log(
        `  Verification — blocklist: ${blocklisted ? '✓ present' : '✗ MISSING'}`,
      )
    }

    if (!allZero || !storageEmpty || (!skipBlock && blocklisted === false)) {
      console.log(`  ⚠️  Some data remains or blocklist entry missing.`)
      return { username, outcome: 'incomplete' as const }
    }
  }

  console.log(`  ✅ Deletion verified.`)
  return { username, outcome: 'deleted' as const }
}

async function main() {
  console.log(
    `Removing ${usernames.length} user(s) on ${isProd ? 'PROD' : 'LOCAL'}.${
      skipPrompt ? ' (non-interactive)' : ''
    }`,
  )

  const rl = readline.createInterface({ input, output })
  const results: Array<Awaited<ReturnType<typeof processOne>>> = []
  try {
    for (const u of usernames) {
      try {
        results.push(await processOne(rl, u))
      } catch (err) {
        console.error(`  ✗ Unexpected error for ${u}:`, err)
        results.push({ username: u, outcome: 'error' as const })
      }
    }
  } finally {
    rl.close()
  }

  console.log(`\n======== Summary ========`)
  for (const r of results) console.log(`  ${r.username.padEnd(24)} ${r.outcome}`)
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
