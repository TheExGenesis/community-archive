'use client'

import Link from 'next/link'
import { LogIn, LogOut, Settings, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { createBrowserClient } from '@/utils/supabase'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { userProfileHref } from '@/lib/navigation'
import { capturePostHogEvent } from '@/lib/posthog'

export default function MobileMenu() {
  const { userMetadata } = useAuthAndArchive()
  const profileHref = userProfileHref(
    userMetadata?.user_name,
    userMetadata?.provider_id,
  )
  const avatarUrl =
    userMetadata?.avatar_url ??
    userMetadata?.picture ??
    userMetadata?.profile_image_url_https ??
    userMetadata?.profile_image_url
  const avatarFallback =
    userMetadata?.user_name?.slice(0, 2).toUpperCase() ?? 'ME'

  const handleSignOut = async () => {
    capturePostHogEvent('navigation_item_clicked', {
      destination: 'sign_out',
      surface: 'account_menu',
      already_active: false,
    })
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signOut()

    if (!error) {
      window.location.href = '/'
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Open account menu"
          className="overflow-hidden rounded-full"
        >
          {userMetadata ? (
            <Avatar className="h-9 w-9">
              <AvatarImage src={avatarUrl} alt="" className="object-cover" />
              <AvatarFallback className="text-xs font-semibold">
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
          ) : (
            <UserRound className="h-5 w-5" />
          )}
          <span className="sr-only">Open account menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 rounded-lg p-2"
      >
        {userMetadata ? (
          <>
            <DropdownMenuItem asChild>
              <Link
                href={profileHref}
                onClick={() =>
                  capturePostHogEvent('navigation_item_clicked', {
                    destination: 'user_profile',
                    surface: 'account_menu',
                    already_active: false,
                  })
                }
                className="cursor-pointer gap-3 py-2.5"
              >
                <UserRound className="h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/settings"
                onClick={() =>
                  capturePostHogEvent('navigation_item_clicked', {
                    destination: 'settings',
                    surface: 'account_menu',
                    already_active: false,
                  })
                }
                className="cursor-pointer gap-3 py-2.5"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer gap-3 py-2.5"
              onSelect={() => void handleSignOut()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem asChild>
            <Link
              href="/login"
              onClick={() =>
                capturePostHogEvent('navigation_item_clicked', {
                  destination: 'sign_in',
                  surface: 'account_menu',
                  already_active: false,
                })
              }
              className="cursor-pointer gap-3 py-2.5"
            >
              <LogIn className="h-4 w-4" />
              Sign in
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
