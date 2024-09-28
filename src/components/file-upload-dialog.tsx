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
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import Link from 'next/link'
import { format, parse } from 'date-fns'
import { Input } from '@/components/ui/input'
import {
  ArchiveStats,
  FileUploadDialogProps,
  UploadOptions,
} from '@/lib-client/types'
import {
  applyOptionsToArchive,
  calculateArchiveStats,
  uploadArchive,
} from '@/lib-client/loadArchive'
import { Progress } from '@/components/ui/progress'

export function FileUploadDialog({
  isOpen,
  onClose,
  archive,
}: FileUploadDialogProps) {
  const [keepPrivate, setKeepPrivate] = useState(false)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [uploadLikes, setUploadLikes] = useState(true)
  const [archiveStats, setArchiveStats] = useState<ArchiveStats>(() =>
    calculateArchiveStats(archive),
  )
  const [startDate, setStartDate] = useState<Date>(
    new Date(archiveStats.earliestTweetDate),
  )
  const [endDate, setEndDate] = useState<Date>(
    new Date(archiveStats.latestTweetDate),
  )
  const [startDateInput, setStartDateInput] = useState(
    format(startDate, 'yyyy-MM-dd'),
  )
  const [endDateInput, setEndDateInput] = useState(
    format(endDate, 'yyyy-MM-dd'),
  )
  const [uploadStatus, setUploadStatus] = useState<
    'not_started' | 'uploading' | 'completed'
  >('not_started')
  const [progress, setProgress] = useState<{
    phase: string
    percent: number | null
  } | null>(null)
  const [uploadedStats, setUploadedStats] = useState<{
    uploadedTweets: number
    uploadedLikes: number
    uploadTime: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const newStats = calculateArchiveStats(archive)
    setArchiveStats(newStats)
    setStartDate(new Date(newStats.earliestTweetDate))
    setEndDate(new Date(newStats.latestTweetDate))
    setStartDateInput(
      format(new Date(newStats.earliestTweetDate), 'yyyy-MM-dd'),
    )
    setEndDateInput(format(new Date(newStats.latestTweetDate), 'yyyy-MM-dd'))
  }, [archive])

  const handleStartDateInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setStartDateInput(event.target.value)
    const parsedDate = parse(event.target.value, 'yyyy-MM-dd', new Date())
    if (!isNaN(parsedDate.getTime())) {
      setStartDate(parsedDate)
    }
  }

  const handleEndDateInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setEndDateInput(event.target.value)
    const parsedDate = parse(event.target.value, 'yyyy-MM-dd', new Date())
    if (!isNaN(parsedDate.getTime())) {
      setEndDate(parsedDate)
    }
  }

  const handleUpload = async () => {
    setUploadStatus('uploading')
    setError(null)
    const options: UploadOptions = {
      keepPrivate,
      uploadLikes,
      startDate,
      endDate,
    }

    const archiveWithOptions = applyOptionsToArchive(archive, options)

    try {
      const filteredStats = calculateArchiveStats(archiveWithOptions)
      await uploadArchive((progressUpdate) => {
        setProgress(progressUpdate)
      }, archiveWithOptions)
      const stats = {
        uploadedTweets: filteredStats.tweetCount,
        uploadedLikes: uploadLikes ? filteredStats.likesCount : 0,
        uploadTime: new Date().toLocaleString(),
      }
      setUploadedStats(stats)
      setUploadStatus('completed')
      console.log('Upload successful')
    } catch (error) {
      console.error('Upload failed:', error)
      setError(error instanceof Error ? error.message : String(error))
      setUploadStatus('not_started')
    }
  }

  const resetDialog = () => {
    setUploadStatus('not_started')
    setProgress(null)
    setUploadedStats(null)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={resetDialog}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {uploadStatus === 'uploading'
              ? 'Uploading...'
              : uploadStatus === 'completed'
                ? 'Upload Successful'
                : error
                  ? 'Upload Error'
                  : 'Upload Confirmation'}
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="grid gap-4 py-4">
            <p className="mb-2 text-sm text-red-600">
              Sorry, there was an error:
            </p>
            <pre className="whitespace-pre-wrap break-words rounded bg-gray-100 p-2 font-mono text-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100">
              {error}
            </pre>
          </div>
        ) : uploadStatus === 'not_started' ? (
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

            {/* Upload Options */}
            <TooltipProvider>
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="keep-private"
                  className="flex flex-col space-y-1"
                >
                  <span className="flex items-center">
                    Keep Private
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="ml-1 h-4 w-4 cursor-pointer text-muted-foreground transition-colors hover:text-primary" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-gray-800 text-white">
                        <p>
                          Data is only visible to you and us. Not the public.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </Label>
                <Switch
                  id="keep-private"
                  checked={keepPrivate}
                  onCheckedChange={setKeepPrivate}
                />
              </div>
            </TooltipProvider>

            {/* Advanced Options */}
            <div className="mt-6">
              <Button
                variant="outline"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="w-full justify-between"
              >
                Advanced Options
                {showAdvancedOptions ? (
                  <ChevronUp className="ml-2 h-4 w-4" />
                ) : (
                  <ChevronDown className="ml-2 h-4 w-4" />
                )}
              </Button>
              {showAdvancedOptions && (
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
                        checked={uploadLikes}
                        onCheckedChange={setUploadLikes}
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
                            value={startDateInput}
                            onChange={handleStartDateInputChange}
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
                            value={endDateInput}
                            onChange={handleEndDateInputChange}
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
                href="/privacy-policy"
                className="text-primary hover:underline"
              >
                Read our Privacy Policy
              </Link>
            </div>
          </div>
        ) : uploadStatus === 'uploading' ? (
          <div className="grid gap-4 py-4">
            <p className="mb-2 text-sm">Uploading your archive...</p>
            {progress && (
              <div>
                <p className="mb-1">
                  {progress.phase}
                  {progress.percent !== null &&
                    `: ${progress.percent.toFixed(2)}%`}
                </p>
                {progress.percent !== null && (
                  <Progress value={progress.percent} className="w-full" />
                )}
              </div>
            )}
          </div>
        ) : uploadStatus === 'completed' && uploadedStats ? (
          <div className="grid gap-4 py-4">
            <p className="mb-2 text-sm text-green-600">
              Your archive has been successfully uploaded!
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">Uploaded Tweets</div>
              <div>{uploadedStats.uploadedTweets.toLocaleString()}</div>
              {uploadLikes && (
                <>
                  <div className="text-muted-foreground">Uploaded Likes</div>
                  <div>{uploadedStats.uploadedLikes.toLocaleString()}</div>
                </>
              )}
              <div className="text-muted-foreground">Upload Time</div>
              <div>{uploadedStats.uploadTime}</div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {uploadStatus === 'not_started' && (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleUpload}>Upload</Button>
            </>
          )}
          {uploadStatus === 'uploading' && (
            <Button variant="outline" onClick={resetDialog}>
              Cancel
            </Button>
          )}
          {(uploadStatus === 'completed' || error) && (
            <Button onClick={resetDialog}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
