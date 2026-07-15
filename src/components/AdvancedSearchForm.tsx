'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ChevronDown,
  ChevronUp,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  buildSearchExpression,
  buildSearchParams,
  normalizeSearchParams,
  parseSearchExpression,
  SearchFilterKey,
} from '@/lib/searchParams'

export default function AdvancedSearchForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [query, setQuery] = useState('')
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)

  useEffect(() => {
    const normalizedSearchParams = normalizeSearchParams(
      new URLSearchParams(searchParams.toString()),
    )
    const expression = buildSearchExpression(normalizedSearchParams)
    setQuery(expression)

    if (
      normalizedSearchParams.has('fromUser') ||
      normalizedSearchParams.has('replyToUser') ||
      normalizedSearchParams.has('sinceDate') ||
      normalizedSearchParams.has('untilDate')
    ) {
      setShowAdvancedOptions(true)
    }
  }, [searchParams])

  // Derive values for advanced fields from the main query string
  const { from, to, since, until } = useMemo(() => {
    const { options } = parseSearchExpression(query)
    return {
      from: options.from || '',
      to: options.to || '',
      since: options.since || '',
      until: options.until || '',
    }
  }, [query])

  const handleFilterChange = (filter: SearchFilterKey, value: string) => {
    const { words, options } = parseSearchExpression(query)

    if (value) {
      options[filter] = value
    } else {
      delete options[filter]
    }

    const newFilterParts = Object.entries(options).map(
      ([key, val]) => `${key}:${val}`,
    )
    const newQuery = [...words, ...newFilterParts].join(' ')
    setQuery(newQuery.trim().replace(/\s+/g, ' '))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const params = buildSearchParams(query)
    router.push(params.size > 0 ? `/search?${params.toString()}` : '/search')
  }

  const activeFilters = [
    { key: 'from' as const, label: 'From', value: from },
    { key: 'to' as const, label: 'To', value: to },
    { key: 'since' as const, label: 'Since', value: since },
    { key: 'until' as const, label: 'Until', value: until },
  ].filter((filter) => filter.value)

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6"
    >
      <Label htmlFor="main-search" className="sr-only">
        Search the archive
      </Label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="main-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search words, phrases, or from:username"
            className="h-12 rounded-lg bg-background pl-12 pr-4 text-base"
            autoComplete="off"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-12 bg-brand px-7 text-brand-foreground hover:bg-brand/90"
        >
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
          className="-ml-3 text-muted-foreground hover:text-foreground"
          aria-expanded={showAdvancedOptions}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filter by user or date
          {showAdvancedOptions ? (
            <ChevronUp className="ml-2 h-4 w-4" />
          ) : (
            <ChevronDown className="ml-2 h-4 w-4" />
          )}
        </Button>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Active filters">
            {activeFilters.map((filter) => (
              <Badge
                key={filter.key}
                variant="secondary"
                className="gap-1.5 py-1 text-muted-foreground"
              >
                {filter.label}: {filter.value}
                <button
                  type="button"
                  onClick={() => handleFilterChange(filter.key, '')}
                  className="rounded-full p-0.5 hover:bg-accent hover:text-foreground"
                  aria-label={`Remove ${filter.label.toLowerCase()} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {showAdvancedOptions && (
        <div className="mt-4 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="from-user">From user</Label>
            <Input
              id="from-user"
              type="text"
              value={from}
              onChange={(e) => handleFilterChange('from', e.target.value)}
              placeholder="username without @"
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to-user">Replying to user</Label>
            <Input
              id="to-user"
              type="text"
              value={to}
              onChange={(e) => handleFilterChange('to', e.target.value)}
              placeholder="username without @"
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="since-date">From date</Label>
            <Input
              id="since-date"
              type="date"
              value={since}
              onChange={(e) => handleFilterChange('since', e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="until-date">To date</Label>
            <Input
              id="until-date"
              type="date"
              value={until}
              onChange={(e) => handleFilterChange('until', e.target.value)}
              className="bg-background"
            />
          </div>
        </div>
      )}
    </form>
  )
}
