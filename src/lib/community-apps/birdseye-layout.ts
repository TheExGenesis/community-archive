import type { BirdseyeAnalysis, BirdseyeCluster } from './types'

export function monthlyActivity(ids: string[]) {
  const counts = new Map<string, number>()
  for (const id of Array.from(new Set(ids))) {
    if (!/^\d{16,20}$/.test(id)) continue
    const time = Number((BigInt(id) >> BigInt(22)) + BigInt('1288834974657'))
    const date = new Date(time)
    if (
      !Number.isFinite(time) ||
      date.getUTCFullYear() < 2010 ||
      date.getUTCFullYear() > 2100
    )
      continue
    const month = date.toISOString().slice(0, 7)
    counts.set(month, (counts.get(month) ?? 0) + 1)
  }
  const months = Array.from(counts.keys()).sort()
  if (!months.length) return []
  const cursor = new Date(`${months[0]}-01T00:00:00Z`)
  const end = months[months.length - 1]
  const result: { month: string; count: number }[] = []
  while (cursor.toISOString().slice(0, 7) <= end) {
    const month = cursor.toISOString().slice(0, 7)
    result.push({ month, count: counts.get(month) ?? 0 })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return result
}

export function birdseyeGroups(analysis: BirdseyeAnalysis) {
  const clusters = new Map(
    analysis.clusters.map((cluster) => [cluster.id, cluster]),
  )
  const grouped = new Set(analysis.groups.flatMap((group) => group.clusterIds))
  return [
    ...analysis.groups,
    {
      name: 'More topics',
      clusterIds: analysis.clusters
        .filter((cluster) => !grouped.has(cluster.id))
        .map((cluster) => cluster.id),
    },
  ]
    .map((group, index) => {
      const topics = Array.from(new Set(group.clusterIds))
        .flatMap((id) => (clusters.has(id) ? [clusters.get(id)!] : []))
        .sort(
          (a, b) =>
            new Set(b.tweetIds).size - new Set(a.tweetIds).size ||
            a.name.localeCompare(b.name),
        )
      const tweetIds = Array.from(
        new Set(topics.flatMap((topic) => topic.tweetIds)),
      )
      return { name: group.name, id: `group-${index}`, topics, tweetIds }
    })
    .filter((group) => group.topics.length)
    .sort(
      (a, b) =>
        b.tweetIds.length - a.tweetIds.length || a.name.localeCompare(b.name),
    )
}

export function yearlySummaries(cluster: BirdseyeCluster) {
  const months = monthlyActivity(cluster.tweetIds)
  if (!months.length) return []
  const start = Number(months[0].month.slice(0, 4))
  const end = Number(months[months.length - 1].month.slice(0, 4))
  return cluster.sections
    .filter((section) => section.name.toLowerCase() === 'yearly summaries')
    .flatMap((section) => section.items)
    .filter(
      (item) =>
        /^\d{4}$/.test(item.label) &&
        Number(item.label) >= start &&
        Number(item.label) <= end,
    )
    .sort((a, b) => Number(a.label) - Number(b.label))
}

export function participantUsername(label: string, participants: string[]) {
  const username = label.replace(/^@/, '').toLowerCase()
  return /^[a-z0-9_]{1,15}$/.test(username) &&
    participants.some((name) => name.toLowerCase() === username)
    ? username
    : null
}
