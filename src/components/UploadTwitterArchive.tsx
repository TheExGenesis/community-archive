'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { deleteArchive } from '../lib-server/db_insert'
import { createBrowserClient } from '@/utils/supabase'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import {
  calculateArchiveStats,
  fetchArchiveUpload,
  handleFileUpload,
} from '@/lib-client/loadArchive'
import { FileUploadDialog } from './file-upload-dialog' // Import the dialog component
import { ArchiveStats } from '@/lib-client/types'
import { devLog } from '@/lib-client/devLog'

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function UploadTwitterArchive() {
  const { userMetadata } = useAuthAndArchive()
  const [isProcessing, setIsProcessing] = useState(false)
  const [archive, setArchive] = useState<any>(null)
  const [archiveStats, setArchiveStats] = useState<ArchiveStats | null>(null)
  const isProcessingRef = useRef(isProcessing)
  const [isDialogOpen, setIsDialogOpen] = useState(false) // State to control dialog visibility
  const isDev = process.env.NODE_ENV === 'development'

  useEffect(() => {
    isProcessingRef.current = isProcessing
  }, [isProcessing])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessingRef.current) {
        const message =
          'Upload is still in progress. Are you sure you want to leave?'
        e.preventDefault()
        e.returnValue = message
        return message
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  const [archiveUpload, setArchiveUpload] = useState<{
    archive_at: string
  } | null>(null)
  const [showUploadButton, setShowUploadButton] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!userMetadata) return
    fetchArchiveUpload(setArchiveUpload, userMetadata)
  }, [userMetadata])

  useEffect(() => {
    if (archive) {
      const stats = calculateArchiveStats(archive)
      setArchiveStats(stats)
      setIsDialogOpen(true) // Open the dialog when archive is available
    }
  }, [archive])

  const onFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const supabase = createBrowserClient()
    setIsProcessing(true)

    try {
      const archive = await handleFileUpload(event, setIsProcessing)
      devLog('archive', archive)
      setArchive(archive)
    } catch (error) {
      console.error('Error processing archive:', error)
      alert('An error occurred while processing archive')
    } finally {
      setIsProcessing(false)
      if (event.target) {
        event.target.value = ''
      }
    }
  }

  const onDeleteArchive = async () => {
    if (
      window.confirm(
        'Are you sure you want to delete your archive? This action cannot be undone.',
      )
    ) {
      setIsDeleting(true)
      const supabase = createBrowserClient()
      try {
        // Delete archive from database
        await deleteArchive(supabase, userMetadata.provider_id)

        // Delete everything in the user's directory in storage
        const { data: fileList, error: listError } = await supabase.storage
          .from('archives')
          .list(userMetadata.provider_id)

        if (listError) {
          console.error('Error listing files in storage:', listError)
          throw listError
        }

        if (fileList && fileList.length > 0) {
          const filesToDelete = fileList.map(
            (file) => `${userMetadata.provider_id}/${file.name}`,
          )
          const { error: deleteError } = await supabase.storage
            .from('archives')
            .remove(filesToDelete)

          if (deleteError) {
            console.error('Error deleting files from storage:', deleteError)
            throw deleteError
          }
        }

        setArchiveUpload(null)
        alert('Archive deleted successfully from database and storage')
        window.location.reload() // Reload the page after successful deletion
      } catch (error) {
        console.error('Error deleting archive:', error)
        alert('An error occurred while deleting the archive')
      } finally {
        setIsDeleting(false)
      }
    }
  }

  return (
    (userMetadata || isDev) && (
      <div className="text-sm dark:text-gray-300">
        {archiveUpload && (
          <>
            <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">
              Your last archive upload was from{' '}
              {formatDate(archiveUpload.archive_at)}.
            </p>
          </>
        )}
        {archiveUpload && !showUploadButton ? (
          <div>
            <button
              onClick={() => setShowUploadButton(true)}
              className="cursor-pointer text-sm text-blue-500 underline dark:text-blue-400"
            >
              Upload a new archive, or delete your data.
            </button>
          </div>
        ) : (
          <div>
            {archiveUpload && (
              <div>
                <button
                  onClick={() => setShowUploadButton(false)}
                  className="cursor-pointer text-sm text-blue-500 underline dark:text-blue-400"
                >
                  Close
                </button>
              </div>
            )}
            <div className="flex flex-col">
              <div className="flex justify-between">
                <div className="mb-4">
                  <p className="mb-4 text-xs dark:text-gray-300">
                    Please upload your Twitter archive as a .zip file.
                  </p>
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    onChange={onFileUpload}
                    disabled={isProcessing}
                    multiple
                  />
                  {isProcessing && (
                    <div className="mt-4">
                      <p className="mb-2">{`Processing archive...`}</p>
                      {/* The progress bar has been moved to FileUploadDialog */}
                      <div className="w-full rounded bg-gray-200">
                        <div
                          className="rounded bg-blue-500 py-1 text-center text-xs leading-none text-white"
                          style={{ width: '0%' }}
                        >
                          0%
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  {archiveUpload && (
                    <>
                      <p className="mb-4 text-xs dark:text-gray-300">
                        This will delete all your data
                      </p>
                      <button
                        onClick={onDeleteArchive}
                        disabled={isDeleting}
                        className="rounded bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-700"
                      >
                        {isDeleting ? 'Deleting...' : 'Delete My Archive'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Include the FileUploadDialog */}
        {archiveStats && (
          <FileUploadDialog
            isOpen={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
            archive={archive}
          />
        )}
      </div>
    )
  )
}
