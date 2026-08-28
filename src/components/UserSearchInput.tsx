'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input, InputProps } from '@/components/ui/input'
import { userProfileHref } from '@/lib/navigation'
import {
  fetchAccountSuggestions,
  fetchMemberSuggestions,
} from '@/lib/queries/fetchUsers'
import {
  getUsernameSearchToken,
  mergeUserSuggestions,
  replaceUsernameTokenWithFromFilter,
} from '@/lib/searchSuggestions'
import type {
  UsernameSearchToken,
  UserSuggestion,
} from '@/lib/searchSuggestions'
import { createBrowserClient } from '@/utils/supabase'
import { cn } from '@/utils/tailwind'

interface UserSearchInputProps extends Omit<InputProps, 'onChange' | 'value'> {
  value: string
  onValueChange: (value: string) => void
}

const SUGGESTION_LIMIT = 6
const SUGGESTION_DELAY_MS = 100
const MEMBER_HEAD_START_MS = 100

export default function UserSearchInput({
  value,
  onValueChange,
  onBlur,
  onClick,
  onFocus,
  onKeyDown,
  onKeyUp,
  type = 'search',
  ...inputProps
}: UserSearchInputProps) {
  const router = useRouter()
  const supabase = useMemo(() => createBrowserClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const requestIdRef = useRef(0)
  const listboxId = `user-search-${useId().replace(/:/g, '')}`
  const [activeIndex, setActiveIndex] = useState(-1)
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([])
  const [token, setToken] = useState<UsernameSearchToken | null>(null)
  const isOpen = suggestions.length > 0 && token !== null
  const optionCount = suggestions.length * 2

  const updateToken = (nextValue: string, caretPosition: number | null) => {
    setToken(getUsernameSearchToken(nextValue, caretPosition))
    setActiveIndex(-1)
  }

  const closeSuggestions = () => {
    requestIdRef.current += 1
    setSuggestions([])
    setToken(null)
    setActiveIndex(-1)
  }

  useEffect(() => {
    const requestId = ++requestIdRef.current
    setSuggestions([])
    setActiveIndex(-1)
    if (!token) return

    const isCurrentRequest = () =>
      requestId === requestIdRef.current &&
      document.activeElement === inputRef.current

    let fallbackTimer: number | undefined
    let memberSuggestions: UserSuggestion[] = []
    let accountSuggestions: UserSuggestion[] = []
    let accountRequest: Promise<void> | null = null

    const renderSuggestions = () => {
      if (!isCurrentRequest()) return
      setSuggestions(
        mergeUserSuggestions(
          memberSuggestions,
          accountSuggestions,
          SUGGESTION_LIMIT,
        ),
      )
    }

    const startAccountLookup = () => {
      if (accountRequest) return accountRequest
      accountRequest = fetchAccountSuggestions(
        supabase,
        token.fragment,
        SUGGESTION_LIMIT,
      )
        .then((users) => {
          accountSuggestions = users
          renderSuggestions()
        })
        .catch(() => {
          // Keep any member suggestions visible if the broader lookup fails.
        })
      return accountRequest
    }

    const timer = window.setTimeout(async () => {
      fallbackTimer = window.setTimeout(
        startAccountLookup,
        MEMBER_HEAD_START_MS,
      )

      try {
        memberSuggestions = await fetchMemberSuggestions(
          token.fragment,
          SUGGESTION_LIMIT,
        )
        if (!isCurrentRequest()) return
        renderSuggestions()
      } catch {
        if (!isCurrentRequest()) return
      }

      if (fallbackTimer !== undefined) {
        window.clearTimeout(fallbackTimer)
        fallbackTimer = undefined
      }
      if (memberSuggestions.length < SUGGESTION_LIMIT) startAccountLookup()
    }, SUGGESTION_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer)
      if (requestIdRef.current === requestId) requestIdRef.current += 1
    }
  }, [supabase, token])

  useEffect(() => {
    if (activeIndex < 0) return
    document
      .getElementById(`${listboxId}-option-${activeIndex}`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, listboxId])

  const openProfile = (suggestion: UserSuggestion) => {
    closeSuggestions()
    router.push(
      userProfileHref(
        suggestion.username,
        suggestion.account_id || suggestion.directory_id,
      ),
    )
  }

  const selectFromFilter = (suggestion: UserSuggestion) => {
    if (!token) return
    const replacement = replaceUsernameTokenWithFromFilter(
      value,
      token,
      suggestion.username,
    )

    onValueChange(replacement.value)
    closeSuggestions()
    const restoreCaret = () => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(
        replacement.caretPosition,
        replacement.caretPosition,
      )
    }
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(restoreCaret)
    } else {
      window.setTimeout(restoreCaret, 0)
    }
  }

  return (
    <>
      <Input
        {...inputProps}
        ref={inputRef}
        type={type}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        onChange={(event) => {
          onValueChange(event.target.value)
          updateToken(event.target.value, event.target.selectionStart)
        }}
        onFocus={(event) => {
          onFocus?.(event)
          updateToken(
            event.currentTarget.value,
            event.currentTarget.selectionStart,
          )
        }}
        onBlur={(event) => {
          onBlur?.(event)
          closeSuggestions()
        }}
        onClick={(event) => {
          onClick?.(event)
          updateToken(
            event.currentTarget.value,
            event.currentTarget.selectionStart,
          )
        }}
        onKeyUp={(event) => {
          onKeyUp?.(event)
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            updateToken(
              event.currentTarget.value,
              event.currentTarget.selectionStart,
            )
          }
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.defaultPrevented || !isOpen) return

          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex((current) => (current + 1) % optionCount)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((current) =>
              current <= 0 ? optionCount - 1 : current - 1,
            )
          } else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault()
            const suggestion = suggestions[Math.floor(activeIndex / 2)]
            if (activeIndex % 2 === 0) {
              openProfile(suggestion)
            } else {
              selectFromFilter(suggestion)
            }
          } else if (event.key === 'Escape') {
            event.preventDefault()
            closeSuggestions()
          }
        }}
      />

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="User suggestions"
          className="absolute left-0 top-full z-50 mt-2 max-h-80 w-full min-w-[18rem] overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
        >
          {suggestions.map((suggestion, index) => {
            const displayName =
              suggestion.account_display_name || suggestion.username
            const profileIndex = index * 2
            const filterIndex = profileIndex + 1
            const isProfileActive = profileIndex === activeIndex
            const isFilterActive = filterIndex === activeIndex

            return (
              <div
                key={suggestion.directory_id}
                role="group"
                aria-label={`@${suggestion.username}`}
                className="border-b border-border py-1 last:border-b-0"
              >
                <button
                  id={`${listboxId}-option-${profileIndex}`}
                  type="button"
                  role="option"
                  aria-selected={isProfileActive}
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(profileIndex)}
                  onClick={() => openProfile(suggestion)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors',
                    isProfileActive
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  <Avatar className="h-9 w-9 border border-border">
                    <AvatarImage
                      src={suggestion.avatar_media_url || undefined}
                      alt=""
                    />
                    <AvatarFallback className="text-xs font-semibold uppercase">
                      {(displayName || '@').slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {displayName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{suggestion.username}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                    Profile
                  </span>
                </button>
                <button
                  id={`${listboxId}-option-${filterIndex}`}
                  type="button"
                  role="option"
                  aria-selected={isFilterActive}
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(filterIndex)}
                  onClick={() => selectFromFilter(suggestion)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors',
                    isFilterActive
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  <Search
                    className="ml-2 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    Search posts from @{suggestion.username}
                  </span>
                  <span className="shrink-0 rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    from:{suggestion.username}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
