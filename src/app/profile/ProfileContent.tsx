'use client'

import { useState, useTransition } from 'react'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { AlertCircle, Archive, Trash2, UserX, CheckCircle, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/utils/supabase'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatDistanceToNow } from 'date-fns'
import { deleteArchive, deleteSingleArchive } from '@/lib/db_insert'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'

interface ProfileContentProps {
  user: User
  initialOptInData: any
  archives: any[]
}

export default function ProfileContent({
  user,
  initialOptInData,
  archives
}: ProfileContentProps) {
  const router = useRouter()
  const { userMetadata } = useAuthAndArchive()
  const [isPending, startTransition] = useTransition()
  const [optInStatus, setOptInStatus] = useState(initialOptInData?.opted_in || false)
  const [explicitOptOut, setExplicitOptOut] = useState(initialOptInData?.explicit_optout || false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deletingArchive, setDeletingArchive] = useState<string | null>(null)
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false)
  const supabase = createBrowserClient()

  const twitterUsername =
    userMetadata?.user_name ||
    user.user_metadata?.user_name ||
    user.user_metadata?.preferred_username ||
    user.user_metadata?.username ||
    user.app_metadata?.user_name

  const twitterUserId =
    userMetadata?.provider_id ||
    user.user_metadata?.provider_id ||
    user.app_metadata?.provider_id

  const handleOptInToggle = async (checked: boolean) => {
    setError(null)
    setSuccess(null)

    startTransition(async () => {
      try {
        // Check if record exists first
        const { data: existingRecord } = await supabase
          .from('optin')
          .select('id')
          .eq('user_id', user.id)
          .single()

        const updatePayload: Record<string, any> = {
          opted_in: checked,
          explicit_optout: false,
          opt_out_reason: null,
        }

        if (twitterUsername) {
          updatePayload.username = twitterUsername.toLowerCase()
        }
        if (twitterUserId) {
          updatePayload.twitter_user_id = twitterUserId
        }

        if (existingRecord) {
          // Update existing record
          const { error: updateError } = await supabase
            .from('optin')
            .update(updatePayload)
            .eq('user_id', user.id)

          if (updateError) throw updateError
        } else {
          if (!twitterUsername) {
            throw new Error('Twitter username not found. Please sign in with Twitter to manage opt-in settings.')
          }

          // Insert new record
          const { error: insertError } = await supabase
            .from('optin')
            .insert({
              user_id: user.id,
              username: twitterUsername.toLowerCase(),
              twitter_user_id: twitterUserId || null,
              opted_in: checked,
              explicit_optout: false,
              opt_out_reason: null
            })

          if (insertError) throw insertError
        }

        setOptInStatus(checked)
        setExplicitOptOut(false)
        setSuccess(checked ? 'Successfully opted in to tweet streaming' : 'Successfully opted out from tweet streaming')

        router.refresh()
      } catch (err: any) {
        setError(err.message || 'Failed to update opt-in status')
        setOptInStatus(!checked) // Revert on error
      }
    })
  }

  const handleExplicitOptOut = async (checked: boolean) => {
    setError(null)
    setSuccess(null)

    startTransition(async () => {
      try {
        // Check if record exists first
        const { data: existingRecord } = await supabase
          .from('optin')
          .select('id')
          .eq('user_id', user.id)
          .single()

        const updatePayload: Record<string, any> = {
          opted_in: false,
          explicit_optout: checked,
          opt_out_reason: checked ? 'User explicitly opted out via profile settings' : null,
        }

        if (twitterUsername) {
          updatePayload.username = twitterUsername.toLowerCase()
        }
        if (twitterUserId) {
          updatePayload.twitter_user_id = twitterUserId
        }

        if (existingRecord) {
          // Update existing record
          const { error: updateError } = await supabase
            .from('optin')
            .update(updatePayload)
            .eq('user_id', user.id)

          if (updateError) throw updateError
        } else {
          if (!twitterUsername) {
            throw new Error('Twitter username not found. Please sign in with Twitter to manage opt-in settings.')
          }

          // Insert new record
          const { error: insertError } = await supabase
            .from('optin')
            .insert({
              user_id: user.id,
              username: twitterUsername.toLowerCase(),
              twitter_user_id: twitterUserId || null,
              opted_in: false,
              explicit_optout: checked,
              opt_out_reason: checked ? 'User explicitly opted out via profile settings' : null
            })

          if (insertError) throw insertError
        }

        setExplicitOptOut(checked)
        if (checked) {
          setOptInStatus(false)
        }
        setSuccess(checked ? 'Added to explicit opt-out list' : 'Removed from explicit opt-out list')

        router.refresh()
      } catch (err: any) {
        setError(err.message || 'Failed to update opt-out status')
        setExplicitOptOut(!checked) // Revert on error
      }
    })
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
    if (!confirm('Are you sure you want to delete this archive? This action cannot be undone.')) {
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
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to delete data')
    } finally {
      setDeletingArchive(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Profile Settings</CardTitle>
          <CardDescription>
            Manage your account settings, privacy preferences, and archived data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="email">Email:</Label>
              <span className="text-muted-foreground">{user.email}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="privacy" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="privacy">Privacy Settings</TabsTrigger>
          <TabsTrigger value="archives">My Archives</TabsTrigger>
        </TabsList>

        <TabsContent value="privacy" className="space-y-4">
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
                  disabled={isPending || explicitOptOut}
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
                  disabled={isPending}
                  className="data-[state=checked]:bg-destructive"
                />
              </div>

              {explicitOptOut && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You are on the explicit opt-out list. Your tweets will not be collected
                    through any automated means.
                  </AlertDescription>
                </Alert>
              )}

              {optInStatus && !explicitOptOut && (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    You have opted in to tweet streaming. Your public tweets may be archived
                    for historical and research purposes.
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/#upload-archive')}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  New Upload
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {archives.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Archive className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>You haven&apos;t uploaded any archives yet</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => router.push('/#upload-archive')}
                  >
                    Upload Archive
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {archives.map((archive) => {
                    const account = archive.accounts
                    const avatarUrl = account?.profile?.[0]?.avatar_media_url || account?.profile?.avatar_media_url
                    return (
                      <div
                        key={archive.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
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
                              {formatDistanceToNow(new Date(archive.created_at), {
                                addSuffix: true
                              })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {archive.keep_private ? '🔒 Private' : '🌐 Public'}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteArchive(archive.id)}
                          disabled={deletingArchive !== null}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {deletingArchive === String(archive.id) ? 'Deleting...' : 'Delete'}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="pt-4 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteAllDialog(true)}
                  disabled={deletingArchive !== null}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete All Your Data
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Remove all archives, tweets, likes, followers, and profile data — including data from the scraper/extension.
                </p>
              </div>

              <Dialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete All Your Data</DialogTitle>
                    <DialogDescription>
                      This will permanently delete <strong>all</strong> of your data from the Community Archive:
                    </DialogDescription>
                  </DialogHeader>
                  <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
                    <li>All uploaded archives</li>
                    <li>All tweets, likes, followers, and following data</li>
                    <li>Profile information</li>
                    <li>Data added by the scraper or browser extension</li>
                  </ul>
                  <p className="text-sm font-medium text-destructive">
                    This action is irreversible.
                  </p>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => setShowDeleteAllDialog(false)}>
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
