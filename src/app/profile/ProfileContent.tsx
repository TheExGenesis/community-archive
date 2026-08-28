'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertCircle,
  Archive,
  CheckCircle,
  HeartOff,
  Loader2,
  Search,
  Trash2,
  UserX,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/utils/supabase'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatDistanceToNow } from 'date-fns'
import { deleteArchive, deleteSingleArchive } from '@/lib/db_insert'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { ArchiveUploadButton } from '@/components/ArchiveUploadButton'
import { capturePostHogEvent } from '@/lib/posthog'
import { updateOptIn } from '@/lib/optInApi'
import { updateDownloadArchiveVisibility } from '@/app/user/[account_id]/actions'
import { OWN_TWEETS_PAGE_SIZE, type OwnTweet } from '@/lib/ownTweetDeletion'

interface ProfileContentProps {
  user: User
  accountId?: string | null
  initialDownloadArchiveVisible?: boolean
  initialOptInData: any
  archives: any[]
  initialTweets?: OwnTweet[]
  initialTweetsHaveMore?: boolean
}

export default function ProfileContent({
  user,
  accountId = null,
  initialDownloadArchiveVisible = true,
  initialOptInData,
  archives,
  initialTweets = [],
  initialTweetsHaveMore = false,
}: ProfileContentProps) {
  const router = useRouter()
  const { userMetadata } = useAuthAndArchive()
  const preferenceMutationInFlight = useRef(false)
  const [isPreferenceSaving, setIsPreferenceSaving] = useState(false)
  const [optInStatus, setOptInStatus] = useState(
    initialOptInData?.opted_in || false,
  )
  const [explicitOptOut, setExplicitOptOut] = useState(
    initialOptInData?.explicit_optout || false,
  )
  const [downloadArchiveVisible, setDownloadArchiveVisible] = useState(
    initialDownloadArchiveVisible,
  )
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deletingArchive, setDeletingArchive] = useState<string | null>(null)
  const [deletingTweetId, setDeletingTweetId] = useState<string | null>(null)
  const [deletingLikes, setDeletingLikes] = useState(false)
  const [ownTweets, setOwnTweets] = useState(initialTweets)
  const [tweetSearch, setTweetSearch] = useState('')
  const [debouncedTweetSearch, setDebouncedTweetSearch] = useState('')
  const [loadingTweets, setLoadingTweets] = useState(false)
  const [loadingMoreTweets, setLoadingMoreTweets] = useState(false)
  const [hasMoreTweets, setHasMoreTweets] = useState(initialTweetsHaveMore)
  const [nextTweetOffset, setNextTweetOffset] = useState(initialTweets.length)
  const [activeTab, setActiveTab] = useState('privacy')
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false)
  const [showOptOutDialog, setShowOptOutDialog] = useState(false)
  const [supabase] = useState(createBrowserClient)
  const [loadMoreTweetsTarget, setLoadMoreTweetsTarget] =
    useState<HTMLDivElement | null>(null)
  const tweetLoadMoreInFlightRef = useRef(false)
  const tweetRequestVersionRef = useRef(0)
  const skipInitialTweetLoadRef = useRef(true)

  const twitterUsername =
    userMetadata?.user_name ||
    user.user_metadata?.user_name ||
    user.user_metadata?.preferred_username ||
    user.user_metadata?.username ||
    user.app_metadata?.user_name

  const beginPreferenceMutation = () => {
    if (preferenceMutationInFlight.current) return false

    preferenceMutationInFlight.current = true
    setIsPreferenceSaving(true)
    return true
  }

  const endPreferenceMutation = () => {
    preferenceMutationInFlight.current = false
    setIsPreferenceSaving(false)
  }

  const handleOptInToggle = async (checked: boolean) => {
    if (!beginPreferenceMutation()) return

    setError(null)
    setSuccess(null)

    try {
      if (!twitterUsername) {
        throw new Error(
          'Twitter username not found. Please sign in with Twitter to manage opt-in settings.',
        )
      }

      await updateOptIn({
        username: twitterUsername.toLowerCase(),
        optedIn: checked,
        termsVersion: 'v1.0',
      })

      setOptInStatus(checked)
      setExplicitOptOut(false)
      setSuccess(
        checked
          ? 'Successfully opted in to tweet streaming'
          : 'Successfully opted out from tweet streaming',
      )
      capturePostHogEvent('tweet_streaming_preference_updated', {
        opted_in: checked,
      })

      await logUserAction(checked ? 'opt_in' : 'opt_out_streaming')

      // Skip router.refresh() — the only thing that changed is the optin row, and we
      // already updated the local state above. Refreshing here re-mounts the whole
      // server-rendered page, which the user perceives as a full reload.
    } catch (err: any) {
      setError(err.message || 'Failed to update opt-in status')
      setOptInStatus(!checked) // Revert on error
    } finally {
      endPreferenceMutation()
    }
  }

  const handleDownloadVisibility = async (checked: boolean) => {
    if (!accountId || !beginPreferenceMutation()) return
    setError(null)
    setSuccess(null)
    try {
      await updateDownloadArchiveVisibility(accountId, checked)
      setDownloadArchiveVisible(checked)
      setSuccess(
        checked
          ? 'Download Archive is visible on your public profile'
          : 'Download Archive is hidden from your public profile',
      )
    } catch (err: any) {
      setError(err.message || 'Failed to update profile visibility')
    } finally {
      endPreferenceMutation()
    }
  }

  // Best-effort append to the user action log. Never throws — logging failures
  // shouldn't break the user-facing action.
  const logUserAction = async (
    action_type: string,
    metadata?: Record<string, unknown>,
  ) => {
    try {
      const { error: logError } = await supabase
        .from('user_action_log')
        .insert({
          account_id: userMetadata?.provider_id ?? null,
          user_id: user.id,
          action_type,
          // Cast through unknown — Record<string, unknown> is structurally compatible
          // with the recursive Json type Supabase generates but TS can't prove it.
          metadata: (metadata ?? null) as unknown as never,
        })
      if (logError) console.warn('user_action_log insert failed:', logError)
    } catch (err) {
      console.warn('user_action_log insert threw:', err)
    }
  }

  // Persists the explicit_optout flag on the optin table. Used by both the immediate
  // toggle-OFF path and the modal-confirmed toggle-ON-with-delete path.
  const persistOptOut = async (checked: boolean) => {
    if (!twitterUsername) {
      throw new Error(
        'Twitter username not found. Please sign in with Twitter to manage opt-in settings.',
      )
    }

    await updateOptIn({
      username: twitterUsername.toLowerCase(),
      optedIn: false,
      termsVersion: 'v1.0',
      explicitOptOut: checked,
      optOutReason: checked
        ? 'User explicitly opted out via profile settings'
        : null,
    })
  }

  // Toggle-ON opens a confirmation dialog (opt-out also deletes all data, mirroring
  // the standalone "Delete All Your Data" flow). Toggle-OFF removes the user from the
  // opt-out list without touching data.
  const handleExplicitOptOut = async (checked: boolean) => {
    setError(null)
    setSuccess(null)

    if (checked) {
      setShowOptOutDialog(true)
      return
    }

    if (!beginPreferenceMutation()) return

    try {
      await persistOptOut(false)
      setExplicitOptOut(false)
      setSuccess('Removed from explicit opt-out list')
      await logUserAction('opt_out_removed')
      // No router.refresh — toggle state already updated locally.
    } catch (err: any) {
      setError(err.message || 'Failed to update opt-out status')
    } finally {
      endPreferenceMutation()
    }
  }

  // Confirmed from the opt-out modal: only add to the opt-out list, no delete.
  const confirmOptOutOnly = async () => {
    if (!beginPreferenceMutation()) return

    setError(null)
    setSuccess(null)

    try {
      await persistOptOut(true)
      setExplicitOptOut(true)
      setOptInStatus(false)
      setShowOptOutDialog(false)
      setSuccess('Added to explicit opt-out list')
      capturePostHogEvent('explicit_opt_out_confirmed', {
        delete_archives: false,
      })
      await logUserAction('opt_out_only')
      // No router.refresh — toggle state already updated locally.
    } catch (err: any) {
      setError(err.message || 'Failed to opt out')
    } finally {
      endPreferenceMutation()
    }
  }

  // Confirmed from the opt-out modal: persist the hard opt-out before deletion
  // so a partial deletion failure can never leave scraping enabled.
  const confirmOptOutAndDelete = async () => {
    if (!userMetadata?.provider_id) {
      setError('Unable to identify user account')
      return
    }

    setDeletingArchive('all')
    setError(null)
    setSuccess(null)

    let optOutSaved = false
    try {
      await persistOptOut(true)
      optOutSaved = true
      setExplicitOptOut(true)
      setOptInStatus(false)

      // persistOptOut() is serviced by the privileged API; the database policy
      // trigger has already synchronously replaced authored rows with tombstones.
      if (twitterUsername)
        await deleteStorageFiles(twitterUsername.toLowerCase())

      setShowOptOutDialog(false)
      setSuccess('Data deleted and added to explicit opt-out list')
      capturePostHogEvent('explicit_opt_out_confirmed', {
        delete_archives: true,
      })
      await logUserAction('opt_out_and_delete')
      router.refresh()
    } catch (err: any) {
      setError(
        optOutSaved
          ? `Opt-out saved and scraping blocked, but data deletion failed: ${err.message || 'unknown error'}`
          : err.message || 'Failed to opt out and delete data',
      )
    } finally {
      setDeletingArchive(null)
    }
  }

  const deleteStorageFiles = async (username: string) => {
    const { data: fileList, error: listError } = await supabase.storage
      .from('archives')
      .list(username)

    if (listError) throw listError

    if (fileList && fileList.length > 0) {
      const filesToDelete = fileList.map(
        (file: { name: string }) => `${username}/${file.name}`,
      )
      const { error: deleteError } = await supabase.storage
        .from('archives')
        .remove(filesToDelete)

      if (deleteError) throw deleteError
    }
  }

  const handleDeleteArchive = async (archiveId: number) => {
    if (
      !confirm(
        'Are you sure you want to delete this archive? This action cannot be undone.',
      )
    ) {
      return
    }

    if (!userMetadata?.provider_id) {
      setError('Unable to identify user account')
      return
    }

    setDeletingArchive(String(archiveId))
    setError(null)
    setSuccess(null)

    try {
      await deleteSingleArchive(supabase, userMetadata.provider_id, archiveId)

      setSuccess('Archive deleted successfully')
      capturePostHogEvent('archive_deleted')
      await logUserAction('delete_archive', { archive_upload_id: archiveId })
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to delete archive')
    } finally {
      setDeletingArchive(null)
    }
  }

  const handleDeleteAllArchives = async () => {
    if (!userMetadata?.provider_id) {
      setError('Unable to identify user account')
      return
    }

    setDeletingArchive('all')
    setError(null)
    setSuccess(null)

    try {
      await deleteArchive(supabase, userMetadata.provider_id)
      await deleteStorageFiles(userMetadata.provider_id)

      setShowDeleteAllDialog(false)
      setSuccess('All data deleted successfully')
      capturePostHogEvent('all_archives_deleted')
      await logUserAction('delete_all_archives')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to delete data')
    } finally {
      setDeletingArchive(null)
    }
  }

  const fetchOwnTweets = useCallback(
    async (search: string, offset: number) => {
      if (!accountId) return { tweets: [] as OwnTweet[], hasMore: false }

      let query = supabase
        .from('tweets')
        .select(
          'tweet_id, created_at, full_text, favorite_count, retweet_count',
        )
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .order('tweet_id', { ascending: false })

      const normalizedSearch = search.trim()
      if (normalizedSearch) {
        query = query.textSearch('fts', normalizedSearch, {
          config: 'english',
          type: 'websearch',
        })
      }

      const { data, error: tweetsError } = await query.range(
        offset,
        offset + OWN_TWEETS_PAGE_SIZE,
      )
      if (tweetsError) throw tweetsError

      const rows = data || []
      return {
        tweets: rows.slice(0, OWN_TWEETS_PAGE_SIZE),
        hasMore: rows.length > OWN_TWEETS_PAGE_SIZE,
      }
    },
    [accountId, supabase],
  )

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedTweetSearch(tweetSearch),
      300,
    )
    return () => window.clearTimeout(timer)
  }, [tweetSearch])

  useEffect(() => {
    if (skipInitialTweetLoadRef.current) {
      skipInitialTweetLoadRef.current = false
      return
    }

    let isCurrentRequest = true
    const requestVersion = ++tweetRequestVersionRef.current

    const reloadTweets = async () => {
      setLoadingTweets(true)
      setError(null)
      try {
        const page = await fetchOwnTweets(debouncedTweetSearch, 0)
        if (
          !isCurrentRequest ||
          requestVersion !== tweetRequestVersionRef.current
        ) {
          return
        }
        setOwnTweets(page.tweets)
        setHasMoreTweets(page.hasMore)
        setNextTweetOffset(page.tweets.length)
      } catch (err: any) {
        if (!isCurrentRequest) return
        setError(err.message || 'Failed to search your tweets')
      } finally {
        if (isCurrentRequest) setLoadingTweets(false)
      }
    }

    void reloadTweets()
    return () => {
      isCurrentRequest = false
    }
  }, [debouncedTweetSearch, fetchOwnTweets])

  const loadMoreTweets = useCallback(async () => {
    if (
      loadingTweets ||
      loadingMoreTweets ||
      !hasMoreTweets ||
      tweetLoadMoreInFlightRef.current
    ) {
      return
    }

    const requestVersion = tweetRequestVersionRef.current
    const offset = nextTweetOffset
    tweetLoadMoreInFlightRef.current = true
    setLoadingMoreTweets(true)
    setError(null)

    try {
      const page = await fetchOwnTweets(debouncedTweetSearch, offset)
      if (requestVersion !== tweetRequestVersionRef.current) return

      setOwnTweets((currentTweets) => {
        const existingIds = new Set(
          currentTweets.map((tweet) => tweet.tweet_id),
        )
        return [
          ...currentTweets,
          ...page.tweets.filter((tweet) => !existingIds.has(tweet.tweet_id)),
        ]
      })
      setHasMoreTweets(page.hasMore)
      setNextTweetOffset(offset + page.tweets.length)
    } catch (err: any) {
      setError(err.message || 'Failed to load more tweets')
    } finally {
      tweetLoadMoreInFlightRef.current = false
      setLoadingMoreTweets(false)
    }
  }, [
    debouncedTweetSearch,
    fetchOwnTweets,
    hasMoreTweets,
    loadingMoreTweets,
    loadingTweets,
    nextTweetOffset,
  ])

  useEffect(() => {
    if (
      activeTab !== 'tweets' ||
      !loadMoreTweetsTarget ||
      !hasMoreTweets ||
      loadingTweets ||
      loadingMoreTweets
    ) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMoreTweets()
      },
      { rootMargin: '300px 0px' },
    )
    observer.observe(loadMoreTweetsTarget)
    return () => observer.disconnect()
  }, [
    activeTab,
    hasMoreTweets,
    loadMoreTweetsTarget,
    loadMoreTweets,
    loadingMoreTweets,
    loadingTweets,
  ])

  const handleDeleteLikes = async () => {
    if (
      !confirm(
        'Delete all records that link your account to tweets you liked? The archived tweet text will remain. This cannot be undone.',
      )
    ) {
      return
    }

    setDeletingLikes(true)
    setError(null)
    setSuccess(null)

    try {
      const { data, error: deleteError } =
        await supabase.rpc('delete_own_likes')
      if (deleteError) throw deleteError

      const deletedLikes = data || 0
      setSuccess(
        `${deletedLikes} ${deletedLikes === 1 ? 'like was' : 'likes were'} removed from your account`,
      )
      capturePostHogEvent('own_likes_deleted', {
        deleted_like_count: deletedLikes,
      })
      await logUserAction('delete_likes', { deleted_likes: deletedLikes })
    } catch (err: any) {
      setError(err.message || 'Failed to delete likes')
    } finally {
      setDeletingLikes(false)
    }
  }

  const handleDeleteTweet = async (tweetId: string) => {
    if (
      !confirm(
        'Permanently delete this tweet and its archived media? This cannot be undone.',
      )
    ) {
      return
    }

    setDeletingTweetId(tweetId)
    setError(null)
    setSuccess(null)

    try {
      const { data, error: deleteError } = await supabase.rpc(
        'delete_own_tweets',
        { p_tweet_ids: [tweetId] },
      )
      if (deleteError) throw deleteError
      if (data?.[0]?.deleted_tweets !== 1) {
        throw new Error('The tweet was not deleted')
      }

      setOwnTweets((tweets) =>
        tweets.filter((tweet) => tweet.tweet_id !== tweetId),
      )
      setNextTweetOffset((offset) => Math.max(0, offset - 1))
      setSuccess('Tweet deleted permanently')
      capturePostHogEvent('own_tweet_deleted')
      await logUserAction('delete_tweet', { tweet_id: tweetId })
    } catch (err: any) {
      setError(err.message || 'Failed to delete tweet')
    } finally {
      setDeletingTweetId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Settings</CardTitle>
          <CardDescription>
            Manage your account settings, privacy preferences, and archived data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="email">Email:</Label>
              <span className="text-muted-foreground">
                {user.email || 'Not provided by X'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={activeTab}
        className="w-full"
        onValueChange={(tab) => {
          setActiveTab(tab)
          capturePostHogEvent('settings_tab_selected', { tab })
        }}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="privacy">Privacy Settings</TabsTrigger>
          <TabsTrigger value="archives">My Archives</TabsTrigger>
          <TabsTrigger value="tweets">My Tweets</TabsTrigger>
        </TabsList>

        <TabsContent value="privacy" className="space-y-4">
          <Card>
            <CardHeader className="space-y-1.5">
              <CardTitle>Public Profile</CardTitle>
              <CardDescription>
                Choose which owner actions appear to visitors
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="download-archive-visible">
                    Show Download Archive
                  </Label>
                  <div className="text-sm text-muted-foreground">
                    Visible by default. Turn this off to hide the button from
                    your public profile.
                  </div>
                </div>
                <Switch
                  id="download-archive-visible"
                  checked={downloadArchiveVisible}
                  onCheckedChange={handleDownloadVisibility}
                  disabled={isPreferenceSaving || !accountId}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1.5">
              <CardTitle>Tweet Streaming Settings</CardTitle>
              <CardDescription>
                Control how your tweets are collected and stored
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="opt-in">Opt-in to Tweet Streaming</Label>
                  <div className="text-sm text-muted-foreground">
                    Allow your public tweets to be automatically archived
                  </div>
                </div>
                <Switch
                  id="opt-in"
                  checked={optInStatus && !explicitOptOut}
                  onCheckedChange={handleOptInToggle}
                  disabled={isPreferenceSaving || explicitOptOut}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="opt-out" className="flex items-center gap-2">
                    Explicit Opt-Out
                    <UserX className="h-4 w-4 text-destructive" />
                  </Label>
                  <div className="text-sm text-muted-foreground">
                    Permanently exclude your tweets from any collection
                  </div>
                </div>
                <Switch
                  id="opt-out"
                  checked={explicitOptOut}
                  onCheckedChange={handleExplicitOptOut}
                  disabled={isPreferenceSaving}
                  className="data-[state=checked]:bg-destructive"
                />
              </div>

              {explicitOptOut && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You are on the explicit opt-out list. Your tweets will not
                    be collected through any automated means.
                  </AlertDescription>
                </Alert>
              )}

              {optInStatus && !explicitOptOut && (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    You have opted in to tweet streaming. Your public tweets may
                    be archived for historical and research purposes.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="archives" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div className="space-y-1.5">
                <CardTitle>Your Archives</CardTitle>
                <CardDescription>
                  Manage your uploaded Twitter archives
                </CardDescription>
              </div>
              {archives?.length > 0 && (
                <ArchiveUploadButton
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  New Upload
                </ArchiveUploadButton>
              )}
            </CardHeader>
            <CardContent>
              {archives.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Archive className="mx-auto mb-3 h-12 w-12 opacity-50" />
                  <p>You haven&apos;t uploaded any archives yet</p>
                  <ArchiveUploadButton variant="outline" className="mt-4 gap-2">
                    Upload Archive
                  </ArchiveUploadButton>
                </div>
              ) : (
                <div className="space-y-4">
                  {archives.map((archive) => {
                    const account = archive.accounts
                    const avatarUrl =
                      account?.profile?.[0]?.avatar_media_url ||
                      account?.profile?.avatar_media_url
                    return (
                      <div
                        key={archive.id}
                        className="flex items-center justify-between rounded-lg border p-4"
                      >
                        <div className="flex items-center space-x-4">
                          <Avatar>
                            <AvatarImage
                              src={avatarUrl}
                              alt={account?.account_display_name}
                            />
                            <AvatarFallback>
                              {account?.account_display_name?.[0] || 'A'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              @{account?.username || 'unknown'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {account?.num_tweets || 0} tweets • Uploaded{' '}
                              {formatDistanceToNow(
                                new Date(archive.created_at),
                                {
                                  addSuffix: true,
                                },
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              🌐 Public
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteArchive(archive.id)}
                          disabled={deletingArchive !== null}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {deletingArchive === String(archive.id)
                            ? 'Deleting...'
                            : 'Delete'}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="border-t pt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteAllDialog(true)}
                  disabled={deletingArchive !== null}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete All Your Data
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  Remove all archives, tweets, likes, followers, and profile
                  data — including data from the scraper/extension.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tweets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Delete Tweets and Likes</CardTitle>
              <CardDescription>
                Permanently remove individual tweets or unlink your likes from
                your account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col justify-between gap-4 rounded-lg border p-4 sm:flex-row sm:items-center">
                <div className="space-y-1">
                  <p className="font-medium">Delete your likes</p>
                  <p className="text-sm text-muted-foreground">
                    Removes only the links between your account and tweets you
                    liked. Archived tweet text remains available.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={handleDeleteLikes}
                  disabled={deletingLikes || !accountId}
                >
                  <HeartOff className="mr-2 h-4 w-4" />
                  {deletingLikes ? 'Deleting...' : 'Delete all likes'}
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tweet-deletion-search">
                  Search your tweets
                </Label>
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="tweet-deletion-search"
                    type="search"
                    value={tweetSearch}
                    onChange={(event) => setTweetSearch(event.target.value)}
                    placeholder="Search the full text of your tweets"
                    className="pl-9"
                  />
                </div>
              </div>

              {loadingTweets ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching tweets...
                </div>
              ) : ownTweets.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  {debouncedTweetSearch
                    ? 'No tweets match your search.'
                    : 'No archived tweets found.'}
                </div>
              ) : (
                <>
                  <div className="divide-y rounded-lg border">
                    {ownTweets.map((tweet) => (
                      <div
                        key={tweet.tweet_id}
                        className="flex items-start justify-between gap-4 p-4"
                      >
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
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-shrink-0"
                          onClick={() => handleDeleteTweet(tweet.tweet_id)}
                          disabled={deletingTweetId !== null}
                          aria-label={`Delete tweet ${tweet.tweet_id}`}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {deletingTweetId === tweet.tweet_id
                            ? 'Deleting...'
                            : 'Delete'}
                        </Button>
                      </div>
                    ))}
                  </div>
                  {hasMoreTweets ? (
                    <div
                      ref={setLoadMoreTweetsTarget}
                      className="min-h-12 flex items-center justify-center gap-2 text-sm text-muted-foreground"
                      aria-live="polite"
                    >
                      {loadingMoreTweets ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading more tweets...
                        </>
                      ) : (
                        'Scroll to load more'
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs live outside <Tabs> so the Opt-Out switch on the Privacy tab and the
          Delete All button on the Archives tab can both open them regardless of which
          TabsContent is currently mounted (Radix tabs lazy-mount their children). */}
      <Dialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete All Your Data</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>all</strong> of your data
              from the Community Archive:
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
            <li>All uploaded archives</li>
            <li>All tweets, likes, followers, and following data</li>
            <li>Profile information</li>
            <li>Data added by the scraper or browser extension</li>
          </ul>
          <p className="text-sm font-medium text-destructive">
            This action is irreversible.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowDeleteAllDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllArchives}
              disabled={deletingArchive === 'all'}
            >
              {deletingArchive === 'all' ? 'Deleting...' : 'Delete Everything'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showOptOutDialog} onOpenChange={setShowOptOutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Explicit Opt-Out</DialogTitle>
            <DialogDescription>
              Opting out adds you to the explicit opt-out list so future
              collection (including scraper/extension data) is prevented. You
              can choose whether to also delete the data already on file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">Opt out only</p>
              <p>
                Add you to the opt-out list. Existing archives, tweets, and
                profile data stay where they are.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">
                Opt out and delete everything
              </p>
              <p>
                Also permanently delete all your archives, tweets, likes,
                followers/following, profile, and any scraper/extension data.
                This part is irreversible.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setShowOptOutDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={confirmOptOutOnly}
              disabled={isPreferenceSaving || deletingArchive === 'all'}
            >
              {isPreferenceSaving ? 'Opting out...' : 'Opt out only'}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmOptOutAndDelete}
              disabled={deletingArchive === 'all'}
            >
              {deletingArchive === 'all'
                ? 'Deleting...'
                : 'Opt out and delete everything'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
