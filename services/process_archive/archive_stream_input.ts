import { createHash } from 'node:crypto'
import type { ArchiveClickHouseDelivery } from './archive_clickhouse'

// Large archives (hundreds of thousands of tweets and likes) do not fit in the
// worker's heap as one string plus one fully parsed object: a 500 MB archive
// with any non-Latin-1 character becomes a ~1 GB two-byte string before
// JSON.parse even starts. This reader decodes the download incrementally,
// parses one top-level array element at a time, and keeps only the fields the
// worker reads (PostgreSQL rows, ClickHouse batches and canonical mutations).
//
// The checksum is computed over the decoded text exactly as
// `createHash('sha256').update(await blob.text(), 'utf8')` did, so pinned
// uploads keep verifying against the storage_sha256 the browser recorded.
//
// When the worker starts reading a new field from an archive, add it to the
// projection below; archive_stream_input.test.ts compares every downstream
// output for a projected and an unprojected archive.

type Json = any

const pick = (source: Json, keys: readonly string[]): Json => {
  if (!source || typeof source !== 'object') return source
  const out: Record<string, Json> = {}
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key]
  }
  return out
}

const MEDIA_KEYS = [
  'id',
  'id_str',
  'media_url',
  'media_url_https',
  'url',
  'expanded_url',
  'display_url',
  'type',
] as const

function projectMedia(media: Json): Json {
  if (!Array.isArray(media)) return media
  return media.map((item) => {
    const out = pick(item, MEDIA_KEYS)
    const large = item?.sizes?.large
    if (large) out.sizes = { large: pick(large, ['w', 'h']) }
    return out
  })
}

const TWEET_KEYS = [
  'id',
  'id_str',
  'created_at',
  'full_text',
  'favorite_count',
  'retweet_count',
  'in_reply_to_status_id',
  'in_reply_to_status_id_str',
  'in_reply_to_user_id',
  'in_reply_to_user_id_str',
  'in_reply_to_screen_name',
  'retweeted_status_id',
  'retweeted_status_id_str',
] as const

export function projectArchiveTweet(record: Json): Json {
  const tweet = record?.tweet
  if (!tweet || typeof tweet !== 'object') return record
  const out = pick(tweet, TWEET_KEYS)
  if (tweet.retweeted_status && typeof tweet.retweeted_status === 'object') {
    out.retweeted_status = pick(tweet.retweeted_status, ['id_str'])
  }
  const entities = tweet.entities
  if (entities && typeof entities === 'object') {
    out.entities = {}
    if (entities.user_mentions !== undefined) {
      out.entities.user_mentions = Array.isArray(entities.user_mentions)
        ? entities.user_mentions.map((mention: Json) =>
            pick(mention, ['id', 'id_str', 'name', 'screen_name']),
          )
        : entities.user_mentions
    }
    if (entities.urls !== undefined) {
      out.entities.urls = Array.isArray(entities.urls)
        ? entities.urls.map((url: Json) =>
            pick(url, ['url', 'expanded_url', 'display_url']),
          )
        : entities.urls
    }
    if (entities.media !== undefined) {
      out.entities.media = projectMedia(entities.media)
    }
  }
  if (tweet.extended_entities && typeof tweet.extended_entities === 'object') {
    out.extended_entities = {}
    if (tweet.extended_entities.media !== undefined) {
      out.extended_entities.media = projectMedia(tweet.extended_entities.media)
    }
  }
  return { tweet: out }
}

function projectRecord(section: string, record: Json): Json {
  switch (section) {
    case 'tweets':
      return projectArchiveTweet(record)
    case 'like':
      return record?.like && typeof record.like === 'object'
        ? { like: pick(record.like, ['tweetId']) }
        : record
    case 'follower':
    case 'following':
      return record?.[section] && typeof record[section] === 'object'
        ? { [section]: pick(record[section], ['accountId']) }
        : record
    case 'note-tweet': {
      const note = record?.noteTweet
      if (!note || typeof note !== 'object') return record
      return {
        noteTweet: {
          createdAt: note.createdAt,
          core: note.core ? { text: note.core.text } : note.core,
        },
      }
    }
    default:
      // account, profile, upload-options and other small sections are kept
      // as written.
      return record
  }
}

export class ArchiveStreamError extends Error {}

const QUOTE = 0x22
const BACKSLASH = 0x5c
const OPEN_OBJECT = 0x7b
const CLOSE_OBJECT = 0x7d
const OPEN_ARRAY = 0x5b
const CLOSE_ARRAY = 0x5d
const COMMA = 0x2c
const COLON = 0x3a

const isWhitespace = (code: number) =>
  code === 0x20 || code === 0x0a || code === 0x0d || code === 0x09

/**
 * Incremental parser for a top-level JSON object whose values are mostly
 * arrays. Each array element (and each non-array value) is parsed on its own
 * with JSON.parse, so peak memory is bounded by the largest single element
 * plus the projected result.
 */
class ArchiveObjectParser {
  readonly result: Record<string, Json> = {}
  // Structural state.
  private depth = 0
  private inString = false
  private escaped = false
  private started = false
  private finished = false
  // depth-1 key being read, and the key whose value is current.
  private readingKey = false
  private keyParts: string[] = []
  private key: string | null = null
  private expectingValue = false
  // The current depth-1 value is an array; elements live at depth 2.
  private inArray = false
  // Text of the value or element being captured.
  private capturing = false
  private parts: string[] = []

  write(chunk: string): void {
    let captureStart = this.capturing ? 0 : -1
    let keyStart = this.readingKey ? 0 : -1
    for (let i = 0; i < chunk.length; i++) {
      const code = chunk.charCodeAt(i)
      if (this.finished) {
        if (!isWhitespace(code)) {
          throw new ArchiveStreamError(
            'Unexpected data after the archive object',
          )
        }
        continue
      }
      if (this.inString) {
        if (this.escaped) this.escaped = false
        else if (code === BACKSLASH) this.escaped = true
        else if (code === QUOTE) {
          this.inString = false
          if (this.readingKey) {
            this.keyParts.push(chunk.slice(keyStart, i))
            this.key = JSON.parse(`"${this.keyParts.join('')}"`)
            this.keyParts = []
            this.readingKey = false
            keyStart = -1
          }
        }
        continue
      }
      if (!this.started) {
        if (isWhitespace(code)) continue
        if (code !== OPEN_OBJECT) {
          throw new ArchiveStreamError('Archive must be a JSON object')
        }
        this.started = true
        this.depth = 1
        continue
      }

      // depth 1: between keys and values of the archive object.
      if (this.depth === 1 && !this.capturing) {
        if (isWhitespace(code) || code === COMMA) continue
        if (!this.expectingValue) {
          if (code === QUOTE) {
            this.inString = true
            this.readingKey = true
            keyStart = i + 1
            continue
          }
          if (code === COLON) {
            this.expectingValue = true
            continue
          }
          if (code === CLOSE_OBJECT) {
            this.depth = 0
            this.finished = true
            continue
          }
          throw new ArchiveStreamError('Malformed archive object')
        }
        if (code === COLON) continue
        // Start of a depth-1 value.
        this.expectingValue = false
        if (code === OPEN_ARRAY) {
          this.inArray = true
          this.depth = 2
          this.result[this.key!] = []
          this.startCapture()
          captureStart = i + 1
          continue
        }
        // Object or primitive value: capture it whole.
        this.startCapture()
        captureStart = i
        // fall through to structural handling of this character below
      }

      if (code === QUOTE) {
        this.inString = true
        continue
      }
      if (code === OPEN_OBJECT || code === OPEN_ARRAY) {
        this.depth++
        continue
      }
      if (code === CLOSE_OBJECT || code === CLOSE_ARRAY) {
        this.depth--
        if (this.inArray && this.depth === 1) {
          // End of a depth-1 array: finish its last element.
          this.parts.push(chunk.slice(captureStart, i))
          this.finishElement()
          this.inArray = false
          captureStart = -1
        } else if (!this.inArray && this.capturing && this.depth === 1) {
          // End of a depth-1 object value.
          this.parts.push(chunk.slice(captureStart, i + 1))
          this.finishValue()
          captureStart = -1
        } else if (this.depth === 0) {
          // The archive object closed right after a primitive value.
          if (this.capturing) {
            this.parts.push(chunk.slice(captureStart, i))
            this.finishValue()
            captureStart = -1
          }
          this.finished = true
        }
        continue
      }
      if (code === COMMA) {
        if (this.inArray && this.depth === 2) {
          this.parts.push(chunk.slice(captureStart, i))
          this.finishElement()
          this.startCapture()
          captureStart = i + 1
        } else if (!this.inArray && this.capturing && this.depth === 1) {
          // End of a depth-1 primitive value.
          this.parts.push(chunk.slice(captureStart, i))
          this.finishValue()
          captureStart = -1
        }
      }
    }
    if (this.capturing && captureStart >= 0) {
      this.parts.push(chunk.slice(captureStart))
    }
    if (this.readingKey && keyStart >= 0) {
      this.keyParts.push(chunk.slice(keyStart))
    }
  }

  end(): Record<string, Json> {
    if (!this.finished || this.inString) {
      throw new ArchiveStreamError('Archive JSON ended early')
    }
    return this.result
  }

  private startCapture() {
    this.capturing = true
    this.parts = []
  }

  private finishElement() {
    const text = this.parts.join('').trim()
    this.parts = []
    this.capturing = false
    if (!text) return // empty array
    const section = this.key!
    this.result[section].push(projectRecord(section, JSON.parse(text)))
  }

  private finishValue() {
    const text = this.parts.join('').trim()
    this.parts = []
    this.capturing = false
    this.result[this.key!] = JSON.parse(text)
  }
}

export interface ArchiveStreamReference
  extends Partial<
    Pick<ArchiveClickHouseDelivery, 'storage_sha256' | 'account_id'>
  > {}

/**
 * Read an archive from a byte stream into the projected archive object,
 * verifying the pinned checksum and owner like parseArchiveInput.
 */
export async function readArchiveStream(
  source: AsyncIterable<Uint8Array>,
  reference?: ArchiveStreamReference,
): Promise<{ archive: Json; bytes: number }> {
  // Same decoding as Blob.text(): UTF-8, replacement characters, BOM removed.
  const decoder = new TextDecoder('utf-8')
  const hash = createHash('sha256')
  const parser = new ArchiveObjectParser()
  let bytes = 0
  // A parse error is reported only after the checksum: modified bytes must
  // surface as a checksum mismatch, as they did before streaming.
  let parseError: unknown = null
  const consume = (text: string) => {
    if (!text) return
    hash.update(text, 'utf8')
    if (parseError) return
    try {
      parser.write(text)
    } catch (error) {
      parseError = error
    }
  }
  for await (const chunk of source) {
    bytes += chunk.byteLength
    consume(decoder.decode(chunk, { stream: true }))
  }
  consume(decoder.decode())
  const digest = hash.digest('hex')
  if (reference?.storage_sha256 && digest !== reference.storage_sha256) {
    throw new Error('Archive checksum mismatch')
  }
  if (parseError) throw parseError
  const archive = parser.end()
  if (
    reference?.account_id &&
    archive.account?.[0]?.account?.accountId !== reference.account_id
  ) {
    throw new Error('Archive owner does not match the upload record')
  }
  return { archive, bytes }
}
