'use client'

import { useState, useTransition } from 'react'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Archive, Trash2, UserX, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/utils/supabase'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatDistanceToNow } from 'date-fns'
import { deleteArchive } from '@/lib/db_insert'
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
  const supabase = createBrowserClient()

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

        if (existingRecord) {
          // Update existing record
          const { error: updateError } = await supabase
            .from('optin')
            .update({
              opted_in: checked,
              explicit_optout: false,
              opt_out_reason: null
            })
            .eq('user_id', user.id)

          if (updateError) throw updateError
        } else {
          // Insert new record
          const { error: insertError } = await supabase
            .from('optin')
            .insert({
              user_id: user.id,
              username: user.email?.split('@')[0] || 'unknown',
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

        if (existingRecord) {
          // Update existing record
          const { error: updateError } = await supabase
            .from('optin')
            .update({
              opted_in: false,
              explicit_optout: checked,
              opt_out_reason: checked ? 'User explicitly opted out via profile settings' : null
            })
            .eq('user_id', user.id)

          if (updateError) throw updateError
        } else {
          // Insert new record
          const { error: insertError } = await supabase
            .from('optin')
            .insert({
              user_id: user.id,
              username: user.email?.split('@')[0] || 'unknown',
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

  const handleDeleteArchive = async (archiveId: string) => {
    if (!confirm('Are you sure you want to delete ALL your archives? This action cannot be undone.')) {
      return
    }

    if (!userMetadata?.provider_id) {
      setError('Unable to identify user account')
      return
    }

    setDeletingArchive(archiveId)
    setError(null)
    setSuccess(null)

    try {
      // Delete from database using the existing function
      await deleteArchive(supabase, userMetadata.provider_id)
      // Delete from storage
      await deleteStorageFiles(userMetadata.provider_id)
      
      setSuccess('All archives deleted successfully')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to delete archives')
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
            <CardHeader>
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
            <CardHeader>
              <CardTitle>Your Archives</CardTitle>
              <CardDescription>
                Manage your uploaded Twitter archives
              </CardDescription>
            </CardHeader>
            <CardContent>
              {archives.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Archive className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>You haven&apos;t uploaded any archives yet</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => router.push('/upload-archive')}
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
                          disabled={deletingArchive === archive.id}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {deletingArchive === archive.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
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