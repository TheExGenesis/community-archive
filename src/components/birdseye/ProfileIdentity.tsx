import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createServerServiceRoleClient } from '@/utils/supabase'

export async function ProfileIdentity({ username }: { username: string }) {
  const { data } = await createServerServiceRoleClient()
    .from('user_directory')
    .select('account_display_name,avatar_media_url')
    .ilike('username', username.replace(/_/g, '\\_'))
    .limit(1)
    .maybeSingle()
  return (
    <Link
      href={`/birdseye?username=${username}`}
      className="flex min-w-0 items-center gap-3"
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={data?.avatar_media_url ?? undefined} alt="" />
        <AvatarFallback>{username.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <h1 className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-sans">
        <span className="text-xl font-bold tracking-tight">
          {data?.account_display_name || username}
        </span>
        <span className="text-sm font-normal text-muted-foreground">
          @{username}
        </span>
      </h1>
    </Link>
  )
}
