/**
 * Upload the spread explorer export to the private Supabase Storage bucket the
 * admin page reads from (src/lib/spreadExplorer/data.ts).
 *
 *   pnpm tsx --env-file=.env scripts/upload-spread-explorer-data.ts /path/to/export --yes
 *
 * Uses NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE from the environment
 * (the service role is needed to write to a private bucket). The bucket is
 * created private if it does not exist; files are upserted so a new export
 * replaces the old one in place. The export names real accounts: keep the
 * bucket private and never add a public policy to it.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BUCKET = process.env.SPREAD_EXPLORER_BUCKET || 'spread-explorer'
const CONCURRENCY = 8

async function walk(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = []
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name)
    const key = prefix ? `${prefix}/${name}` : name
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full, key)))
    else if (!name.startsWith('.')) out.push(key)
  }
  return out
}

async function main() {
  const [dir, flag] = process.argv.slice(2)
  if (!dir)
    throw new Error('usage: upload-spread-explorer-data.ts <export dir> --yes')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE
  if (!url || !key)
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE are required',
    )
  const files = await walk(dir)
  if (
    !files.includes('meta.json') ||
    !files.some((f) => f.startsWith('words/'))
  )
    throw new Error(`${dir} does not look like a spread explorer export`)
  console.log(
    `${files.length} files from ${dir} -> ${new URL(url).host} bucket "${BUCKET}"`,
  )
  if (flag !== '--yes') {
    console.log('dry run: pass --yes to upload')
    return
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data: buckets, error: listError } =
    await supabase.storage.listBuckets()
  if (listError) throw listError
  if (!buckets.some((b) => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: false,
    })
    if (error) throw error
    console.log(`created private bucket ${BUCKET}`)
  } else if (buckets.find((b) => b.name === BUCKET)?.public) {
    throw new Error(
      `bucket ${BUCKET} is public; make it private before uploading`,
    )
  }
  let done = 0
  const queue = files.slice()
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const body = await readFile(path.join(dir, file))
        const contentType = file.endsWith('.gz')
          ? 'application/gzip'
          : 'application/json'
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(file, body, { contentType, upsert: true })
        if (error) throw new Error(`${file}: ${error.message}`)
        if (++done % 500 === 0) console.log(`${done}/${files.length}`)
      }
    }),
  )
  console.log(`uploaded ${done} files`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
