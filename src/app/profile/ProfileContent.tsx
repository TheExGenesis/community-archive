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

interface ProfileContentProps {
  user: User
  initialOptInData: any
  initialOptOutData: any
  archives: any[]
}

export default function ProfileContent({
  user,
  initialOptInData,
  initialOptOutData,
  archives
}: ProfileContentProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optInStatus, setOptInStatus] = useState(initialOptInData?.opted_in || false)
  const [optOutStatus, setOptOutStatus] = useState(initialOptOutData?.opted_out || false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deletingArchive, setDeletingArchive] = useState<string | null>(null)
  const supabase = createBrowserClient()

  const handleOptInToggle = async (checked: boolean) => {
    setError(null)
    setSuccess(null)
    
    startTransition(async () => {
      try {
        if (checked) {
          // Opting in - remove from opt-out if exists
          if (optOutStatus) {
            await supabase
              .from('optout')
              .delete()
              .eq('user_id', user.id)
            setOptOutStatus(false)
          }

          // Create or update opt-in record
          const { error: optInError } = await supabase
            .from('optin')
            .upsert({
              user_id: user.id,
              username: user.email?.split('@')[0] || 'unknown',
              opted_in: true,
              explicit_optout: false
            })

          if (optInError) throw optInError
          setOptInStatus(true)
          setSuccess('Successfully opted in to tweet streaming')
        } else {
          // Opting out from opt-in
          const { error: optInError } = await supabase
            .from('optin')
            .update({ opted_in: false, explicit_optout: true })
            .eq('user_id', user.id)

          if (optInError) throw optInError
          setOptInStatus(false)
          setSuccess('Successfully opted out from tweet streaming')
        }
        
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
        if (checked) {
          // Adding to explicit opt-out list
          const { error: optOutError } = await supabase
            .from('optout')
            .upsert({
              user_id: user.id,
              username: user.email?.split('@')[0] || 'unknown',
              opted_out: true
            })

          if (optOutError) throw optOutError

          // Also update opt-in table if exists
          await supabase
            .from('optin')
            .update({ opted_in: false, explicit_optout: true })
            .eq('user_id', user.id)

          setOptOutStatus(true)
          setOptInStatus(false)
          setSuccess('Added to explicit opt-out list')
        } else {
          // Removing from explicit opt-out list
          const { error: deleteError } = await supabase
            .from('optout')
            .delete()
            .eq('user_id', user.id)

          if (deleteError) throw deleteError

          // Update opt-in table if exists
          await supabase
            .from('optin')
            .update({ explicit_optout: false })
            .eq('user_id', user.id)

          setOptOutStatus(false)
          setSuccess('Removed from explicit opt-out list')
        }
        
        router.refresh()
      } catch (err: any) {
        setError(err.message || 'Failed to update opt-out status')
        setOptOutStatus(!checked) // Revert on error
      }
    })
  }

  const handleDeleteArchive = async (archiveId: string) => {
    if (!confirm('Are you sure you want to delete this archive? This action cannot be undone.')) {
      return
    }

    setDeletingArchive(archiveId)
    setError(null)
    setSuccess(null)

    try {
      // Call the delete archive function
      const { error } = await (supabase.rpc as any)('delete_single_user_archive', {
        p_archive_upload_id: parseInt(archiveId)
      })

      if (error) throw error

      setSuccess('Archive deleted successfully')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to delete archive')
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
            <div className="flex items-center space-x-2">
              <Label htmlFor="userId">User ID:</Label>
              <span className="text-muted-foreground font-mono text-xs">{user.id}</span>
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
                  checked={optInStatus && !optOutStatus}
                  onCheckedChange={handleOptInToggle}
                  disabled={isPending || optOutStatus}
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
                  checked={optOutStatus}
                  onCheckedChange={handleExplicitOptOut}
                  disabled={isPending}
                  className="data-[state=checked]:bg-destructive"
                />
              </div>

              {optOutStatus && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You are on the explicit opt-out list. Your tweets will not be collected
                    through any automated means.
                  </AlertDescription>
                </Alert>
              )}

              {optInStatus && !optOutStatus && (
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
                  <p>You haven't uploaded any archives yet</p>
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
                  {archives.map((archive) => (
                    <div
                      key={archive.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center space-x-4">
                        <Avatar>
                          <AvatarImage
                            src={archive.accounts?.avatar_media_url}
                            alt={archive.accounts?.account_display_name}
                          />
                          <AvatarFallback>
                            {archive.accounts?.account_display_name?.[0] || 'A'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            @{archive.accounts?.username || 'unknown'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {archive.total_tweets || 0} tweets • Uploaded{' '}
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
                  ))}
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