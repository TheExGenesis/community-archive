import 'server-only'
import * as React from 'react'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { unstable_cache } from 'next/cache'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { publicDataConfig } from '@/lib/publicDataSource'
import { readDirectoryMembers } from '@/lib/directoryMembers'
import type { AppDataManifest, BirdseyeAnalysis, Strand } from './types'
import positions from './strand-positions.json'
import display from './strand-display.json'
import { clusterPositions } from './strand-layout'

const strandPositions = new Map(
  clusterPositions(positions).map((p) => [p.id, p]),
)

const BUCKET = 'community-app-data'
// Only normalized display data lives here. Never expose private Storage URLs,
// credentials, pickle files, original archives, or embedding vectors.
const readSnapshot = unstable_cache(
  async (key: string, _source: string): Promise<unknown> => {
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
  const manifest = (await readSnapshot(
    'manifest.json',
    publicDataConfig().sourceId,
  )) as AppDataManifest
  if (manifest.version !== 1 || !/^v1\/[a-zA-Z0-9_-]+$/.test(manifest.prefix))
    throw new Error('Unsupported community app data manifest')
  return manifest
}
// Policy is checked on every request, independently of the snapshot cache.
export async function getAppPolicy(usernames: string[]) {
  const admin = createServerServiceRoleClient({ noStore: true })
  const names = Array.from(
    new Set(usernames.map((name) => name.toLowerCase())),
  ).filter((name) => /^[a-z0-9_]{1,15}$/.test(name))
  const nameSet = new Set(names)
  const loadOptouts = async () => {
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
    return { blocked, blockedIds }
  }
  const loadCandidates = async () =>
    (await readDirectoryMembers(admin, names)).flatMap((row) =>
      nameSet.has(row.username.toLowerCase())
        ? [
            {
              username: row.username.toLowerCase(),
              accountId: row.account_id ?? '',
            },
          ]
        : [],
    )
  // Never publish candidates until BOTH current membership and consent succeed.
  const [{ blocked, blockedIds }, candidates] = await Promise.all([
    loadOptouts(),
    loadCandidates(),
  ])
  const members = new Set(
    candidates
      .filter(
        (row) => !blocked.has(row.username) && !blockedIds.has(row.accountId),
      )
      .map((row) => row.username),
  )
  return { blocked, blockedIds, members }
}
export function hasBlockedParticipant(
  participants: string[],
  blocked: Set<string>,
) {
  return participants.some((username) => blocked.has(username.toLowerCase()))
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
    publicDataConfig().sourceId,
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
    publicDataConfig().sourceId,
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
        totalPosts: (display.strands as Record<string, { totalPosts: number }>)[
          strand.id
        ]?.totalPosts,
        mapLabel: (display.labels as Record<string, string>)[strand.id],
        activity: (display.strands as Record<string, { counts: number[] }>)[
          strand.id
        ]
          ? {
              months: display.months,
              counts: (display.strands as Record<string, { counts: number[] }>)[
                strand.id
              ].counts,
            }
          : undefined,
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

/**
 * Visibility check for one strand, with the same rules as getStrands() but a
 * membership lookup for its author only. API routes call this per request.
 */
export async function getVisibleStrand(seed: string) {
  const manifest = await getAppDataManifest()
  const strands = (await readSnapshot(
    `${manifest.prefix}/strands.json`,
    publicDataConfig().sourceId,
  )) as Strand[]
  const strand = strands.find((item) => item.id === seed)
  if (!strand) return null
  const policy = await getAppPolicy([strand.username])
  if (
    !policy.members.has(strand.username.toLowerCase()) ||
    hasBlockedParticipant(strand.participants, policy.blocked)
  )
    return null
  return strand
}
