import 'server-only'
import * as React from 'react'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { unstable_cache } from 'next/cache'
import { createServerServiceRoleClient } from '@/utils/supabase'
import type { AppDataManifest, BirdseyeAnalysis, Strand } from './types'
import positions from './strand-positions.json'
import { clusterPositions } from './strand-layout'

const strandPositions = new Map(
  clusterPositions(positions).map((p) => [p.id, p]),
)

const BUCKET = 'community-app-data'
// Only normalized display data lives here. Never expose private Storage URLs,
// credentials, pickle files, original archives, or embedding vectors.
const readSnapshot = unstable_cache(
  async (key: string): Promise<unknown> => {
    if (!/^[a-zA-Z0-9_./-]+$/.test(key) || key.includes('..'))
      throw new Error('Invalid app data path')
    if (process.env.COMMUNITY_APP_DATA_DIR) {
      return JSON.parse(
        await readFile(
          path.join(process.env.COMMUNITY_APP_DATA_DIR, key),
          'utf8',
        ),
      )
    }
    const { data, error } = await createServerServiceRoleClient()
      .storage.from(BUCKET)
      .download(key)
    if (error || !data) throw new Error('Community app data is unavailable')
    return JSON.parse(await data.text())
  },
  ['community-app-display-data-v2'],
  { revalidate: 300 },
)

export async function getAppDataManifest(): Promise<AppDataManifest> {
  const manifest = (await readSnapshot('manifest.json')) as AppDataManifest
  if (manifest.version !== 1 || !/^v1\/[a-zA-Z0-9_-]+$/.test(manifest.prefix))
    throw new Error('Unsupported community app data manifest')
  return manifest
}
// Policy is checked on every request, independently of the snapshot cache.
export async function getAppPolicy(usernames: string[]) {
  const admin = createServerServiceRoleClient()
  const blocked = new Set<string>()
  const blockedIds = new Set<string>()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin
      .from('optin')
      .select('username,twitter_user_id')
      .eq('explicit_optout', true)
      .order('id')
      .range(offset, offset + 999)
    if (error) throw new Error('Community app consent check failed')
    for (const row of data ?? []) {
      blocked.add(row.username.toLowerCase())
      if (row.twitter_user_id) blockedIds.add(row.twitter_user_id)
    }
    if ((data ?? []).length < 1000) break
  }
  const members = new Set<string>()
  const names = Array.from(
    new Set(usernames.map((name) => name.toLowerCase())),
  ).filter((name) => /^[a-z0-9_]{1,15}$/.test(name))
  for (let offset = 0; offset < names.length; offset += 40) {
    const { data, error } = await admin
      .from('user_directory')
      .select('account_id,username,has_archive,is_opted_in')
      .or(
        names
          .slice(offset, offset + 40)
          .map((name) => `username.ilike.${name}`)
          .join(','),
      )
    if (error) throw new Error('Community app membership check failed')
    for (const row of data ?? []) {
      if (
        row.username &&
        names.includes(row.username.toLowerCase()) &&
        !blockedIds.has(row.account_id ?? '') &&
        (row.has_archive || row.is_opted_in) &&
        !blocked.has(row.username.toLowerCase())
      )
        members.add(row.username.toLowerCase())
    }
  }
  return { blocked, blockedIds, members }
}
export function hasBlockedParticipant(
  participants: string[],
  blocked: Set<string>,
) {
  return participants.some((username) => blocked.has(username.toLowerCase()))
}
export async function getBirdseyeCatalog() {
  const manifest = await getAppDataManifest()
  const policy = await getAppPolicy(
    manifest.birdseye.map((entry) => entry.username),
  )
  return {
    manifest,
    policy,
    accounts: manifest.birdseye.filter((entry) =>
      policy.members.has(entry.username),
    ),
  }
}
export async function getBirdseyeAnalysis(
  username: string,
  manifest: AppDataManifest,
  blocked: Set<string>,
) {
  if (!/^[a-z0-9_]{1,15}$/.test(username))
    throw new Error('Invalid Birdseye username')
  const analysis = (await readSnapshot(
    `${manifest.prefix}/birdseye/${username}.json`,
  )) as BirdseyeAnalysis
  const hidden = new Set(
    manifest.birdseye.find((entry) => entry.username === username)
      ?.hiddenClusterIds ?? [],
  )
  return {
    ...analysis,
    clusters: analysis.clusters.filter(
      (cluster) =>
        !hidden.has(cluster.id) &&
        !hasBlockedParticipant(cluster.participants, blocked),
    ),
  }
}
async function loadStrands() {
  const manifest = await getAppDataManifest()
  const strands = (await readSnapshot(
    `${manifest.prefix}/strands.json`,
  )) as Strand[]
  const policy = await getAppPolicy(strands.map((strand) => strand.username))
  return {
    generatedAt: manifest.strandsGeneratedAt,
    strands: strands
      .filter(
        (strand) =>
          policy.members.has(strand.username.toLowerCase()) &&
          !hasBlockedParticipant(strand.participants, policy.blocked),
      )
      .map((strand) => ({
        ...strand,
        position: strandPositions.get(strand.id),
      })),
  }
}

// Deduplicate metadata and page loading within one request, never across users
// or requests. Tests use React 18 without the RSC cache implementation.
const requestCache =
  (
    React as typeof React & {
      cache?: <T>(loader: () => Promise<T>) => () => Promise<T>
    }
  ).cache ?? (<T>(loader: () => Promise<T>) => loader)
export const getStrands = requestCache(loadStrands)
