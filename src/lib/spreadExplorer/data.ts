import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { shardOf } from './tokens'
import type { SpreadAnchor, SpreadMeta, SpreadVocab, SpreadWord } from './types'

// The export (scripts/build-spread-explorer-data.py) lives either in a local
// directory (SPREAD_EXPLORER_DATA_DIR, for development) or in a private
// Supabase Storage bucket read with the service role. It names real accounts,
// so every reader of this module must sit behind the admin gate.
const BUCKET = process.env.SPREAD_EXPLORER_BUCKET || 'spread-explorer'
const SHARD_CACHE_SIZE = 48

type Shard = Record<string, number[]>
type Handles = Record<string, [number, number, number]>

const cache = new Map<string, Promise<unknown>>()
const shardCache = new Map<number, Promise<Shard>>()

async function readBytes(key: string): Promise<Buffer> {
  if (!/^[a-zA-Z0-9_./-]+$/.test(key) || key.includes('..'))
    throw new Error('Invalid spread explorer data path')
  const dir = process.env.SPREAD_EXPLORER_DATA_DIR
  if (dir) return readFile(path.join(dir, key))
  const { data, error } = await createServerServiceRoleClient()
    .storage.from(BUCKET)
    .download(key)
  if (error || !data)
    throw new Error(
      `Spread explorer data is unavailable (${key}): ${error?.message ?? 'no data'}`,
    )
  return Buffer.from(await data.arrayBuffer())
}

async function readJson<T>(key: string): Promise<T> {
  const bytes = await readBytes(key)
  const text = key.endsWith('.gz')
    ? gunzipSync(bytes).toString('utf8')
    : bytes.toString('utf8')
  return JSON.parse(text) as T
}

function cached<T>(key: string): Promise<T> {
  let hit = cache.get(key) as Promise<T> | undefined
  if (!hit) {
    hit = readJson<T>(key)
    cache.set(key, hit)
    hit.catch(() => cache.delete(key))
  }
  return hit
}

export const getSpreadMeta = () => cached<SpreadMeta>('meta.json')
export const getSpreadVocab = () => cached<SpreadVocab>('vocab.json')
const getHandles = () => cached<Handles>('handles.json.gz')

function getShard(shards: number, index: number): Promise<Shard> {
  let hit = shardCache.get(index)
  if (!hit) {
    hit = readJson<Shard>(`words/${String(index).padStart(4, '0')}.json.gz`)
    shardCache.set(index, hit)
    hit.catch(() => shardCache.delete(index))
    if (shardCache.size > SHARD_CACHE_SIZE) {
      const oldest = shardCache.keys().next().value
      if (oldest !== undefined) shardCache.delete(oldest)
    }
  }
  return hit
}

/** Uses of one token per hex per month, from the shard its CRC32 points at. */
export async function getSpreadWord(token: string): Promise<SpreadWord> {
  const meta = await getSpreadMeta()
  const hexes = meta.hex.x.length
  const months = meta.months.length
  const shard = await getShard(meta.shards, shardOf(token, meta.shards))
  const flat = shard[token]
  const uses = Array.from({ length: hexes }, () =>
    new Array<number>(months).fill(0),
  )
  const total = new Array<number>(months).fill(0)
  if (flat) {
    for (let i = 0; i + 2 < flat.length; i += 3) {
      const [cell, month, n] = [flat[i], flat[i + 1], flat[i + 2]]
      if (month < 0 || month >= months) continue
      total[month] += n
      if (cell >= 0 && cell < hexes) uses[cell][month] = n // cell == hexes: off the map
    }
  }
  return { word: token, known: Boolean(flat), uses, total }
}

/** Where each handle's account sits on the map; `hex` is -1 for accounts off the map. */
export async function getSpreadAnchors(
  handles: string[],
): Promise<SpreadAnchor[]> {
  const known = await getHandles()
  return handles.map((handle) => {
    const hit = known[handle]
    return hit
      ? { handle, hex: hit[0], x: hit[1], y: hit[2] }
      : { handle, missing: true, hex: -1, x: 0, y: 0 }
  })
}
