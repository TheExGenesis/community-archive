'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Search, Trash2 } from 'lucide-react'
import { searchOwnTweets } from '@/app/settings/tweet-actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { capturePostHogEvent } from '@/lib/posthog'
import { captureProductAction } from '@/lib/productAnalytics'
import {
  ownTweetPatterns,
  type OwnTweetKind,
  type OwnTweetSearch,
  type OwnTweetSort,
} from '@/lib/ownTweetSearch'
import { createBrowserClient } from '@/utils/supabase'

export type OwnTweet = {
  tweet_id: string
  created_at: string
  full_text: string
  favorite_count: number | null
  retweet_count: number | null
}

type Filters = Required<Omit<OwnTweetSearch, 'offset'>>

const defaultFilters: Filters = {
  query: '',
  kind: 'all',
  olderThanYears: 0,
  sort: 'newest',
}

// delete_own_tweets accepts at most 100 IDs per call.
const DELETE_BATCH_SIZE = 100

const selectClass =
  'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function OwnTweetsPanel({
  initialTweets,
  logUserAction,
}: {
  initialTweets?: OwnTweet[]
  logUserAction: (
    action_type: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void>
}) {
  const supabase = createBrowserClient()
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [queryDraft, setQueryDraft] = useState('')
  const [activePattern, setActivePattern] = useState<string | null>(null)
  const [tweets, setTweets] = useState<OwnTweet[]>(initialTweets ?? [])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(initialTweets === undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<string | 'selected' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  // Ignores responses from searches the user has since replaced.
  const requestId = useRef(0)

  const runSearch = async (next: Filters, append = false) => {
    const id = ++requestId.current
    setLoading(true)
    setLoadError(null)
    if (!append) setSelected(new Set())
    try {
      const page = await searchOwnTweets({
        ...next,
        offset: append ? tweets.length : 0,
      })
      if (id !== requestId.current) return
      setTweets((current) =>
        append ? [...current, ...page.tweets] : page.tweets,
      )
      setHasMore(page.hasMore)
    } catch {
      if (id !== requestId.current) return
      setLoadError('Your tweets could not be loaded.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (initialTweets === undefined) void runSearch(defaultFilters)
    // Load once when the tab mounts; later searches are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyFilters = (next: Filters, pattern: string | null = null) => {
    setFilters(next)
    setQueryDraft(next.query)
    setActivePattern(pattern)
    void runSearch(next)
  }

  const submitQuery = (event: FormEvent) => {
    event.preventDefault()
    applyFilters({ ...filters, query: queryDraft.trim() })
    captureProductAction('tweet_cleanup', 'searched')
  }

  const changeFilter = (patch: Partial<Filters>) => {
    applyFilters({ ...filters, query: queryDraft.trim(), ...patch })
    captureProductAction('tweet_cleanup', 'filter_changed')
  }

  const choosePattern = (patternId: string) => {
    if (activePattern === patternId) {
      applyFilters(defaultFilters)
      return
    }
    const pattern = ownTweetPatterns.find(({ id }) => id === patternId)
    if (!pattern) return
    applyFilters({ ...defaultFilters, ...pattern.search }, patternId)
    captureProductAction('tweet_cleanup', 'pattern_selected')
  }

  const toggleSelected = (tweetId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(tweetId)
      else next.delete(tweetId)
      return next
    })
  }

  const allShownSelected =
    tweets.length > 0 && tweets.every(({ tweet_id }) => selected.has(tweet_id))

  const deleteTweets = async (tweetIds: string[], fromSelection: boolean) => {
    const single = tweetIds.length === 1
    if (
      !confirm(
        single
          ? 'Permanently delete this tweet and its archived media? This cannot be undone.'
          : `Permanently delete ${tweetIds.length} tweets and their archived media? This cannot be undone.`,
      )
    ) {
      return
    }

    setDeleting(fromSelection ? 'selected' : tweetIds[0])
    setError(null)
    setSuccess(null)
    const deleted: string[] = []
    try {
      for (let i = 0; i < tweetIds.length; i += DELETE_BATCH_SIZE) {
        const batch = tweetIds.slice(i, i + DELETE_BATCH_SIZE)
        const { data, error: deleteError } = await supabase.rpc(
          'delete_own_tweets',
          { p_tweet_ids: batch },
        )
        if (deleteError) throw deleteError
        if (data?.[0]?.deleted_tweets !== batch.length) {
          throw new Error('Some tweets were not deleted. Please retry.')
        }
        deleted.push(...batch)
      }
      setSuccess(
        single
          ? 'Tweet deleted permanently'
          : `${deleted.length} tweets deleted permanently`,
      )
      if (single) capturePostHogEvent('own_tweet_deleted')
      else captureProductAction('tweet_cleanup', 'bulk_deleted')
      await logUserAction(
        single ? 'delete_tweet' : 'delete_tweets',
        single ? { tweet_id: tweetIds[0] } : { count: deleted.length },
      )
    } catch (err: any) {
      setError(err.message || 'Failed to delete tweets')
    } finally {
      const gone = new Set(deleted)
      setTweets((current) =>
        current.filter(({ tweet_id }) => !gone.has(tweet_id)),
      )
      setSelected((current) => {
        const next = new Set(current)
        deleted.forEach((tweetId) => next.delete(tweetId))
        return next
      })
      setDeleting(null)
    }
  }

  const filtered =
    filters.query !== '' ||
    filters.kind !== 'all' ||
    filters.olderThanYears !== 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Tweets</CardTitle>
        <CardDescription>
          Search your archive and permanently remove tweets. Deleting here
          removes them from the Community Archive, not from X.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submitQuery} className="flex gap-2" role="search">
          <Input
            type="search"
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            placeholder='Search your tweets — words, "exact phrase", or, -exclude'
            aria-label="Search your tweets"
          />
          <Button type="submit" variant="secondary" disabled={loading}>
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
        </form>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Tweets people often clean up
          </p>
          <div className="flex flex-wrap gap-2">
            {ownTweetPatterns.map((pattern) => (
              <Button
                key={pattern.id}
                type="button"
                size="sm"
                variant={activePattern === pattern.id ? 'default' : 'outline'}
                className="h-7 rounded-full px-3 text-xs"
                title={pattern.description}
                aria-pressed={activePattern === pattern.id}
                onClick={() => choosePattern(pattern.id)}
              >
                {pattern.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            className={selectClass}
            aria-label="Tweet type"
            value={filters.kind}
            onChange={(event) =>
              changeFilter({ kind: event.target.value as OwnTweetKind })
            }
          >
            <option value="all">Tweets & replies</option>
            <option value="original">Tweets only</option>
            <option value="replies">Replies only</option>
          </select>
          <select
            className={selectClass}
            aria-label="Tweet age"
            value={filters.olderThanYears}
            onChange={(event) =>
              changeFilter({ olderThanYears: Number(event.target.value) })
            }
          >
            <option value={0}>Any age</option>
            <option value={1}>Older than 1 year</option>
            <option value={3}>Older than 3 years</option>
            <option value={5}>Older than 5 years</option>
            <option value={10}>Older than 10 years</option>
          </select>
          <select
            className={selectClass}
            aria-label="Sort tweets"
            value={filters.sort}
            onChange={(event) =>
              changeFilter({ sort: event.target.value as OwnTweetSort })
            }
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="least_liked">Least liked first</option>
            <option value="most_liked">Most liked first</option>
          </select>
          {(filtered || activePattern) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => applyFilters(defaultFilters)}
            >
              Clear
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {tweets.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-4 py-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allShownSelected}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked === true
                      ? new Set(tweets.map(({ tweet_id }) => tweet_id))
                      : new Set(),
                  )
                }
                aria-label="Select all shown tweets"
              />
              {selected.size > 0
                ? `${selected.size} selected`
                : `${tweets.length}${hasMore ? '+' : ''} tweets shown`}
            </label>
            <Button
              variant="destructive"
              size="sm"
              disabled={selected.size === 0 || deleting !== null}
              onClick={() => void deleteTweets(Array.from(selected), true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting === 'selected'
                ? 'Deleting...'
                : `Delete selected${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </Button>
          </div>
        )}

        {loading && tweets.length === 0 ? (
          <p role="status" className="py-8 text-center text-muted-foreground">
            Loading your tweets…
          </p>
        ) : loadError ? (
          <div role="alert" className="space-y-3 py-4">
            <p>{loadError}</p>
            <Button variant="outline" onClick={() => void runSearch(filters)}>
              Retry loading tweets
            </Button>
          </div>
        ) : tweets.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {filtered
              ? 'No tweets match this search.'
              : 'No archived tweets found.'}
          </div>
        ) : (
          <div
            className={`divide-y rounded-lg border ${loading ? 'opacity-60' : ''}`}
            aria-busy={loading}
          >
            {tweets.map((tweet) => (
              <div
                key={tweet.tweet_id}
                className="flex items-start justify-between gap-4 p-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.has(tweet.tweet_id)}
                    onCheckedChange={(checked) =>
                      toggleSelected(tweet.tweet_id, checked === true)
                    }
                    aria-label={`Select tweet ${tweet.tweet_id}`}
                  />
                  <div className="min-w-0 space-y-2">
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {tweet.full_text}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tweet.created_at).toLocaleDateString()} ·{' '}
                      {tweet.favorite_count || 0} likes ·{' '}
                      {tweet.retweet_count || 0} reposts
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => void deleteTweets([tweet.tweet_id], false)}
                  disabled={deleting !== null}
                  aria-label={`Delete tweet ${tweet.tweet_id}`}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {deleting === tweet.tweet_id ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            ))}
          </div>
        )}

        {hasMore && !loadError && (
          <Button
            variant="outline"
            className="w-full"
            disabled={loading}
            onClick={() => {
              void runSearch(filters, true)
              captureProductAction('tweet_cleanup', 'load_more')
            }}
          >
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
