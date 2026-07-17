'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input, InputProps } from '@/components/ui/input'
import { fetchUserSuggestions } from '@/lib/queries/fetchUsers'
import {
  getUsernameSearchToken,
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
const SUGGESTION_DELAY_MS = 200

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
  const supabase = useMemo(() => createBrowserClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const requestIdRef = useRef(0)
  const listboxId = `user-search-${useId().replace(/:/g, '')}`
  const [activeIndex, setActiveIndex] = useState(-1)
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([])
  const [token, setToken] = useState<UsernameSearchToken | null>(null)
  const isOpen = suggestions.length > 0 && token !== null

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

    const timer = window.setTimeout(() => {
      fetchUserSuggestions(supabase, token.fragment, SUGGESTION_LIMIT)
        .then((users) => {
          if (
            requestId === requestIdRef.current &&
            document.activeElement === inputRef.current
          ) {
            setSuggestions(users)
          }
        })
        .catch(() => {
          if (requestId === requestIdRef.current) setSuggestions([])
        })
    }, SUGGESTION_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [supabase, token])

  useEffect(() => {
    if (activeIndex < 0) return
    document
      .getElementById(`${listboxId}-option-${activeIndex}`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, listboxId])

  const selectSuggestion = (suggestion: UserSuggestion) => {
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
            setActiveIndex((current) => (current + 1) % suggestions.length)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((current) =>
              current <= 0 ? suggestions.length - 1 : current - 1,
            )
          } else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault()
            selectSuggestion(suggestions[activeIndex])
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
          className="absolute left-0 top-full z-50 mt-2 max-h-80 w-full min-w-[18rem] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
        >
          {suggestions.map((suggestion, index) => {
            const displayName =
              suggestion.account_display_name || suggestion.username
            const isActive = index === activeIndex

            return (
              <button
                key={suggestion.directory_id}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={isActive}
                onPointerDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectSuggestion(suggestion)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors',
                  isActive
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
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  from:{suggestion.username}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
