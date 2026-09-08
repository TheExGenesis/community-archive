import { Box, Heart, Smile, Target, Users, Lightbulb } from 'lucide-react'
import { InsightItem } from './InsightItem'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { participantUsername } from '@/lib/community-apps/birdseye-layout'
import type { BirdseyeCluster } from '@/lib/community-apps/types'
const sectionIcon = (name: string) =>
  name.toLowerCase().includes('relation')
    ? Users
    : name.toLowerCase().includes('belief')
      ? Heart
      : name.toLowerCase().includes('goal')
        ? Target
        : name.toLowerCase().includes('mood')
          ? Smile
          : name.toLowerCase().includes('entit')
            ? Box
            : Lightbulb
export async function InsightCards({ cluster }: { cluster: BirdseyeCluster }) {
  const sections = cluster.sections
    .filter(
      (section) =>
        section.items.length &&
        section.name.toLowerCase() !== 'yearly summaries',
    )
    .sort(
      (a, b) =>
        Number(b.name.toLowerCase() === 'entities') -
        Number(a.name.toLowerCase() === 'entities'),
    )
  const usernames = Array.from(
    new Set(
      sections.flatMap((section) =>
        section.items.flatMap((item) => {
          const name = participantUsername(item.label, cluster.participants)
          return name ? [name] : []
        }),
      ),
    ),
  )
  const avatars = new Map<string, string>()
  for (let offset = 0; offset < usernames.length; offset += 40) {
    const { data } = await createServerServiceRoleClient()
      .from('user_directory')
      .select('username,avatar_media_url')
      .or(
        usernames
          .slice(offset, offset + 40)
          .map((username) => `username.ilike.${username.replace(/_/g, '\\_')}`)
          .join(','),
      )
    for (const row of data ?? [])
      if (row.username && row.avatar_media_url)
        avatars.set(row.username.toLowerCase(), row.avatar_media_url)
  }
  return (
    <div className="grid items-start gap-3 xl:grid-cols-2">
      {sections.map((section) => {
        const Icon = sectionIcon(section.name)
        return (
          <section
            key={section.name}
            className="rounded-xl border border-border bg-card/40 p-3"
          >
            <h3 className="mb-2 flex items-center gap-2 font-sans text-xs font-bold">
              <Icon size={14} className="text-brand" />
              {section.name}
              <span className="ml-auto font-normal text-muted-foreground">
                {section.items.length}
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {section.items.map((item, index) => {
                const username = participantUsername(
                  item.label,
                  cluster.participants,
                )
                return (
                  <InsightItem
                    key={`${item.label}:${index}`}
                    item={item}
                    username={username}
                    avatar={username ? avatars.get(username) : undefined}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
