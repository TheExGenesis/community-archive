import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import { getArchiveTweetMedia } from '../src/lib/archiveMedia'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const limitArg = args.find((arg) => arg.startsWith('--limit='))
const usernameArg = args.find((arg) => arg.startsWith('--username='))
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : undefined
const requestedUsername = usernameArg?.slice('--username='.length).toLowerCase()

if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
  throw new Error('--limit must be a positive integer')
}

if (requestedUsername && !/^[a-z0-9_]{1,15}$/.test(requestedUsername)) {
  throw new Error('--username must be a valid Twitter username')
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE
if (!supabaseUrl || !serviceRole) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE are required',
  )
}

const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type ArchiveUpload = { id: number; username: string }

type RepairRow = {
  tweet_id: string
  media_id: string
  media_url: string
  media_type: string
  width: number
  height: number
  archive_upload_id: number
}

async function loadUploads(): Promise<ArchiveUpload[]> {
  let query = supabase
    .from('archive_upload')
    .select('id, username')
    .eq('upload_phase', 'completed')
    .order('archive_at', { ascending: true })

  if (requestedUsername) query = query.ilike('username', requestedUsername)
  if (limit) query = query.limit(limit)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ArchiveUpload[]
}

function expectedMediaRows(archive: any, archiveUploadId: number): RepairRow[] {
  return (archive.tweets ?? []).flatMap((record: any) => {
    const tweet = record.tweet
    const tweetId = String(tweet.id_str || tweet.id)

    return getArchiveTweetMedia(tweet).flatMap((media) => {
      const mediaId = media.id_str || media.id
      const mediaUrl = media.media_url_https || media.media_url
      if (!mediaId || !mediaUrl) return []

      return [{
        tweet_id: tweetId,
        media_id: String(mediaId),
        media_url: mediaUrl,
        media_type: media.type || 'photo',
        width: media.sizes?.large?.w || 0,
        height: media.sizes?.large?.h || 0,
        archive_upload_id: archiveUploadId,
      }]
    })
  })
}

async function missingRows(expected: RepairRow[]): Promise<RepairRow[]> {
  const existing = new Set<string>()
  const batchSize = 200

  for (let offset = 0; offset < expected.length; offset += batchSize) {
    const batch = expected.slice(offset, offset + batchSize)
    const { data, error } = await supabase
      .from('tweet_media')
      .select('media_id')
      .in('media_id', batch.map((row) => row.media_id))
    if (error) throw error
    for (const row of data ?? []) existing.add(String(row.media_id))
  }

  return expected.filter((row) => !existing.has(row.media_id))
}

async function main() {
  const uploads = await loadUploads()
  let candidateTweets = 0
  let candidateMedia = 0

  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'}: checking ${uploads.length} completed archive(s)`,
  )

  for (const upload of uploads) {
    const username = upload.username.toLowerCase()
    if (!/^[a-z0-9_]{1,15}$/.test(username)) {
      console.warn(`Skipping invalid archive username: ${upload.username}`)
      continue
    }

    const { data, error } = await supabase.storage
      .from('archives')
      .download(`${username}/archive.json`)
    if (error) {
      console.warn(`Skipping ${username}: ${error.message}`)
      continue
    }

    const archive = JSON.parse(await data.text())
    const expected = expectedMediaRows(archive, upload.id)
    const missing = await missingRows(expected)
    if (!missing.length) continue

    const tweetCount = new Set(missing.map((row) => row.tweet_id)).size
    candidateTweets += tweetCount
    candidateMedia += missing.length
    console.log(`${username}: ${missing.length} missing media row(s) on ${tweetCount} tweet(s)`)

    if (apply) {
      const { error: upsertError } = await supabase
        .from('tweet_media')
        .upsert(missing, { onConflict: 'media_id' })
      if (upsertError) throw upsertError
    }
  }

  console.log(
    `${apply ? 'Repaired' : 'Found'} ${candidateMedia} media row(s) on ${candidateTweets} tweet(s)`,
  )
  if (!apply && candidateMedia) {
    console.log('Re-run with --apply after reviewing this audit to insert only missing rows.')
  }
}

await main()
