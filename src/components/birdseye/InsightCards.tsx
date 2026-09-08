import Link from 'next/link'
import {
  Box,
  Heart,
  Link2,
  Smile,
  Target,
  UserRound,
  Users,
  Lightbulb,
} from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
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
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {sections.map((section) => {
        const Icon = sectionIcon(section.name)
        return (
          <section
            key={section.name}
            className="rounded-2xl border border-border bg-card/60 p-4"
          >
            <h3 className="mb-4 flex items-center gap-2 font-sans text-sm font-bold">
              <Icon size={16} className="text-brand" />
              {section.name}
              <span className="ml-auto font-normal text-muted-foreground">
                {section.items.length}
              </span>
            </h3>
            <div className="divide-y divide-border/50">
              {section.items.map((item, index) => {
                const username = participantUsername(
                  item.label,
                  cluster.participants,
                )
                return (
                  <div
                    key={`${item.label}:${index}`}
                    className="py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2">
                      {username && (
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={avatars.get(username)} alt="" />
                          <AvatarFallback>
                            <UserRound size={14} />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <h4 className="font-sans text-sm font-semibold">
                        {username ? (
                          <Link
                            href={`/user/${username}`}
                            className="hover:text-brand"
                          >
                            @{username}
                          </Link>
                        ) : (
                          item.label
                        )}
                      </h4>
                    </div>
                    {item.description && (
                      <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Array.from(new Set(item.tweetIds)).map((id, i) => (
                        <Link
                          prefetch={false}
                          key={id}
                          href={`/tweets/${id}`}
                          aria-label={`Source ${i + 1} for ${item.label}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-brand hover:bg-brand/10"
                        >
                          <Link2 size={13} />
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
