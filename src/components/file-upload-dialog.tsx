'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import Link from 'next/link'
import { format, parse } from 'date-fns'
import {
  ArchiveStats,
  FileUploadDialogProps,
  UploadOptions,
} from '@/lib-client/types'
import { uploadArchive } from '@/lib-client/upload-archive/uploadArchive'
import { calculateArchiveStats } from '@/lib-client/upload-archive/calculateArchiveStats'
import { applyOptionsToArchive } from '@/lib-client/upload-archive/applyOptionsToArchive'

interface FileUploadDialogState {
  keepPrivate: boolean
  showAdvancedOptions: boolean
  uploadLikes: boolean
  uploadStatus: 'not_started' | 'uploading' | 'completed'
  progress: { phase: string; percent: number | null } | null
  uploadedStats: {
    uploadedTweets: number
    uploadedLikes: number
    uploadTime: string
  } | null
  error: string | null
}

const initialState: FileUploadDialogState = {
  keepPrivate: false,
  showAdvancedOptions: false,
  uploadLikes: true,
  uploadStatus: 'not_started',
  progress: null,
  uploadedStats: null,
  error: null,
}

export function FileUploadDialog({
  supabase,
  isOpen,
  onClose,
  archive,
}: FileUploadDialogProps) {
  const [state, setState] = useState<FileUploadDialogState>(initialState)
  const [archiveStats, setArchiveStats] = useState<ArchiveStats>(() =>
    calculateArchiveStats(archive),
  )
  const [dateRange, setDateRange] = useState({
    start: new Date(archiveStats.earliestTweetDate),
    end: new Date(archiveStats.latestTweetDate),
  })
  const [dateInputs, setDateInputs] = useState({
    start: format(dateRange.start, 'yyyy-MM-dd'),
    end: format(dateRange.end, 'yyyy-MM-dd'),
  })

  useEffect(() => {
    const newStats = calculateArchiveStats(archive)
    setArchiveStats(newStats)
    setDateRange({
      start: new Date(newStats.earliestTweetDate),
      end: new Date(newStats.latestTweetDate),
    })
    setDateInputs({
      start: format(new Date(newStats.earliestTweetDate), 'yyyy-MM-dd'),
      end: format(new Date(newStats.latestTweetDate), 'yyyy-MM-dd'),
    })
  }, [archive])

  const handleDateInputChange =
    (type: 'start' | 'end') => (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value
      setDateInputs((prev) => ({ ...prev, [type]: newValue }))
      const parsedDate = parse(newValue, 'yyyy-MM-dd', new Date())
      if (!isNaN(parsedDate.getTime())) {
        setDateRange((prev) => ({ ...prev, [type]: parsedDate }))
      }
    }

  const handleUpload = async () => {
    setState((prev) => ({ ...prev, uploadStatus: 'uploading', error: null }))
    const options: UploadOptions = {
      keepPrivate: state.keepPrivate,
      uploadLikes: state.uploadLikes,
      startDate: dateRange.start,
      endDate: dateRange.end,
    }

    const archiveWithOptions = applyOptionsToArchive(archive, options)

    try {
      const filteredStats = calculateArchiveStats(archiveWithOptions)
      await uploadArchive(
        supabase,
        (progressUpdate) =>
          setState((prev) => ({ ...prev, progress: progressUpdate })),
        archiveWithOptions,
      )
      const stats = {
        uploadedTweets: filteredStats.tweetCount,
        uploadedLikes: state.uploadLikes ? filteredStats.likesCount : 0,
        uploadTime: new Date().toLocaleString(),
      }
      setState((prev) => ({
        ...prev,
        uploadedStats: stats,
        uploadStatus: 'completed',
      }))
      console.log('Upload successful')
    } catch (error) {
      console.error('Upload failed:', error)
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : String(error),
        uploadStatus: 'not_started',
      }))
    }
  }

  const resetDialog = () => {
    setState(initialState)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={resetDialog}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {state.uploadStatus === 'uploading'
              ? 'Uploading...'
              : state.uploadStatus === 'completed'
                ? 'Upload Successful'
                : state.error
                  ? 'Upload Error'
                  : 'Upload Confirmation'}
          </DialogTitle>
        </DialogHeader>
        {state.error ? (
          <div className="grid gap-4 py-4">
            <p className="mb-2 text-sm text-red-600">
              Sorry, there was an error:
            </p>
            <pre className="whitespace-pre-wrap break-words rounded bg-gray-100 p-2 font-mono text-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100">
              {state.error}
            </pre>
          </div>
        ) : state.uploadStatus === 'not_started' ? (
          <div className="grid gap-4 py-4">
            {/* Display Archive Statistics */}
            <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">Username</div>
              <div>{archiveStats.username}</div>
              <div className="text-muted-foreground">Display Name</div>
              <div>{archiveStats.accountDisplayName}</div>
              <div className="text-muted-foreground">Total Tweets</div>
              <div>{archiveStats.tweetCount.toLocaleString()}</div>
              <div className="text-muted-foreground">Total Likes</div>
              <div>{archiveStats.likesCount.toLocaleString()}</div>
              <div className="text-muted-foreground">Followers</div>
              <div>{archiveStats.followerCount.toLocaleString()}</div>
              <div className="text-muted-foreground">Date Range</div>
              <div>
                {new Date(archiveStats.earliestTweetDate).toLocaleDateString()}{' '}
                - {new Date(archiveStats.latestTweetDate).toLocaleDateString()}
              </div>
            </div>

            {/* Advanced Options */}
            <div className="mt-6">
              <Button
                variant="outline"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    showAdvancedOptions: !prev.showAdvancedOptions,
                  }))
                }
                className="w-full justify-between"
              >
                Advanced Options
                {state.showAdvancedOptions ? (
                  <ChevronUp className="ml-2 h-4 w-4" />
                ) : (
                  <ChevronDown className="ml-2 h-4 w-4" />
                )}
              </Button>
              {state.showAdvancedOptions && (
                <div className="mt-4 space-y-4 border-t pt-4">
                  <TooltipProvider>
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="upload-likes"
                        className="flex items-center"
                      >
                        <span>Upload Likes</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="ml-1 h-4 w-4 cursor-pointer text-muted-foreground hover:text-primary" />
                          </TooltipTrigger>
                          <TooltipContent className="bg-gray-800 text-white">
                            <p>Upload likes and liked tweets.</p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Switch
                        id="upload-likes"
                        checked={state.uploadLikes}
                        onCheckedChange={(checked: boolean) =>
                          setState((prev) => ({
                            ...prev,
                            uploadLikes: checked,
                          }))
                        }
                      />
                    </div>
                    <div className="mt-4 flex flex-col space-y-2">
                      <Label className="flex items-center">
                        <span>Filter Tweets by Date</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="ml-1 h-4 w-4 cursor-pointer text-muted-foreground hover:text-primary" />
                          </TooltipTrigger>
                          <TooltipContent className="bg-gray-800 text-white">
                            <p>
                              Select a date range to filter tweets for upload
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <div className="flex items-center space-x-4">
                        <div className="flex flex-col">
                          <Label htmlFor="start-date" className="mb-1 text-sm">
                            Start Date
                          </Label>
                          <Input
                            id="start-date"
                            type="date"
                            value={dateInputs.start}
                            onChange={handleDateInputChange('start')}
                            className="w-[150px]"
                          />
                        </div>
                        <div className="flex flex-col">
                          <Label htmlFor="end-date" className="mb-1 text-sm">
                            End Date
                          </Label>
                          <Input
                            id="end-date"
                            type="date"
                            value={dateInputs.end}
                            onChange={handleDateInputChange('end')}
                            className="w-[150px]"
                          />
                        </div>
                      </div>
                    </div>
                  </TooltipProvider>
                </div>
              )}
            </div>

            {/* Privacy Policy Link */}
            <div className="mt-4 text-center text-sm">
              <Link
                href="/data-policy"
                className="text-primary hover:underline"
              >
                Read our Privacy Policy
              </Link>
            </div>
          </div>
        ) : state.uploadStatus === 'uploading' ? (
          <div className="grid gap-4 py-4">
            <p className="mb-2 text-sm">Uploading your archive...</p>
            {state.progress && (
              <div>
                <p className="mb-1">
                  {state.progress.phase}
                  {state.progress.percent !== null &&
                    `: ${state.progress.percent.toFixed(2)}%`}
                </p>
                {state.progress.percent !== null && (
                  <Progress value={state.progress.percent} className="w-full" />
                )}
              </div>
            )}
          </div>
        ) : state.uploadStatus === 'completed' && state.uploadedStats ? (
          <div className="grid gap-4 py-4">
            <p className="mb-2 text-sm text-green-600">
              Your archive has been successfully uploaded!
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">Uploaded Tweets</div>
              <div>{state.uploadedStats.uploadedTweets.toLocaleString()}</div>
              {state.uploadLikes && (
                <>
                  <div className="text-muted-foreground">Uploaded Likes</div>
                  <div>
                    {state.uploadedStats.uploadedLikes.toLocaleString()}
                  </div>
                </>
              )}
              <div className="text-muted-foreground">Upload Time</div>
              <div>{state.uploadedStats.uploadTime}</div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {state.uploadStatus === 'not_started' && (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleUpload}>Upload</Button>
            </>
          )}
          {state.uploadStatus === 'uploading' && (
            <Button variant="outline" onClick={resetDialog}>
              Cancel
            </Button>
          )}
          {(state.uploadStatus === 'completed' || state.error) && (
            <Button onClick={resetDialog}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
