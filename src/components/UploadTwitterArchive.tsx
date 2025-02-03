'use client'

import { useState, useEffect, useRef } from 'react'
import { deleteArchive } from '../lib-client/db_insert'
import { createBrowserClient } from '@/utils/supabase'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { FileUploadDialog } from './file-upload-dialog'
import { ArchiveStats, Archive, ArchiveUpload } from '@/lib-client/types'
import { devLog } from '@/lib-client/devLog'
import { fetchArchiveUpload } from '@/lib-client/queries/fetchArchiveUpload'
import { calculateArchiveStats } from '@/lib-client/upload-archive/calculateArchiveStats'
import { handleFileUpload } from '@/lib-client/upload-archive/handleFileUpload'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

interface UploadTwitterArchiveState {
  isProcessing: boolean
  archive: Archive | null
  archiveStats: ArchiveStats | null
  isDialogOpen: boolean
  archiveUpload: ArchiveUpload | null
  showUploadButton: boolean
  isDeleting: boolean
}
export default function UploadTwitterArchive(props: {
  supabase: SupabaseClient<Database> | null
}) {
  const { userMetadata } = useAuthAndArchive()
  const supabase = props.supabase || createBrowserClient()
  const [state, setState] = useState<UploadTwitterArchiveState>({
    isProcessing: false,
    archive: null,
    archiveStats: null,
    isDialogOpen: false,
    archiveUpload: null,
    showUploadButton: false,
    isDeleting: false,
  })
  const isProcessingRef = useRef(state.isProcessing)
  const isDev = process.env.NODE_ENV === 'development'

  useEffect(() => {
    isProcessingRef.current = state.isProcessing
  }, [state.isProcessing])

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
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  useEffect(() => {
    const fetchArchive = async () => {
      if (!userMetadata) return
      const archiveUpload = await fetchArchiveUpload(userMetadata)
      console.log({ archiveUpload, userMetadata })
      setState((prev) => ({ ...prev, archiveUpload: archiveUpload || null }))
    }
    fetchArchive()
  }, [userMetadata])

  useEffect(() => {
    if (state.archive) {
      const stats = calculateArchiveStats(state.archive)
      setState((prev) => ({ ...prev, archiveStats: stats, isDialogOpen: true }))
    }
  }, [state.archive])

  const onFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setState((prev) => ({ ...prev, isProcessing: true }))

    try {
      const archive = await handleFileUpload(event, (isProcessing) =>
        setState((prev) => ({ ...prev, isProcessing })),
      )
      devLog('archive', archive)
      setState((prev: UploadTwitterArchiveState) => ({ ...prev, archive }))
    } catch (error) {
      console.error('Error processing archive:', error)
      alert(
        `An error occurred while processing archive: ${
          (error as Error).message
        }`,
      )
    } finally {
      setState((prev) => ({ ...prev, isProcessing: false }))
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
      setState((prev) => ({ ...prev, isDeleting: true }))
      try {
        await deleteArchive(supabase, userMetadata.provider_id)
        await deleteStorageFiles(supabase, userMetadata.provider_id)
        setState((prev) => ({ ...prev, archiveUpload: null }))
        alert('Archive deleted successfully from database and storage')
        window.location.reload()
      } catch (error) {
        console.error('Error deleting archive:', error)
        alert('An error occurred while deleting the archive')
      } finally {
        setState((prev) => ({ ...prev, isDeleting: false }))
      }
    }
  }

  return (
    userMetadata && (
      <div className="text-sm dark:text-gray-300">
        {state.archiveUpload && (
          <>
            <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">
              Your last archive upload was from{' '}
              {formatDate(state.archiveUpload.archive_at)}.
            </p>
          </>
        )}
        {state.archiveUpload && !state.showUploadButton ? (
          <div
            className="transition-colsors rounded-md bg-zinc-100 p-4 duration-200 hover:bg-zinc-50 dark:bg-gray-900 dark:hover:bg-gray-800"
            onClick={() =>
              setState((prev) => ({ ...prev, showUploadButton: true }))
            }
          >
            <button className="cursor-pointer text-sm font-bold text-blue-500 hover:underline dark:text-blue-400">
              Upload a new archive, or delete your data.
            </button>
          </div>
        ) : (
          <div className="transition-colsors rounded-md bg-zinc-100 p-4 duration-200 hover:bg-zinc-50 dark:bg-gray-900 dark:hover:bg-gray-800">
            {state.archiveUpload && (
              <div>
                <button
                  onClick={() =>
                    setState((prev) => ({ ...prev, showUploadButton: false }))
                  }
                  className="cursor-pointer text-sm text-blue-500 underline dark:text-blue-400"
                >
                  Close
                </button>
              </div>
            )}
            <div className="flex flex-col">
              <div className="flex justify-between">
                <div className="mb-4">
                  <p className="mb-6 text-xs dark:text-gray-300">
                    Please upload your Twitter archive as a .zip file.
                  </p>
                  <label className="mb-4 cursor-pointer rounded bg-zinc-500 px-4 py-3 text-sm text-white hover:bg-zinc-600 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-700">
                    Choose Files
                    <input
                      type="file"
                      accept=".zip,application/zip"
                      onChange={onFileUpload}
                      disabled={state.isProcessing}
                      multiple
                      className="hidden"
                    />
                  </label>
                  {state.isProcessing && (
                    <div className="mt-4">
                      <p className="mb-2">{`Processing archive...`}</p>
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
                  {state.archiveUpload && (
                    <>
                      <p className="mb-4 text-xs dark:text-gray-300">
                        This will delete all your data
                      </p>
                      <button
                        onClick={onDeleteArchive}
                        disabled={state.isDeleting}
                        className="rounded bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-50 dark:bg-red-800 dark:hover:bg-red-700"
                      >
                        {state.isDeleting ? 'Deleting...' : 'Delete My Archive'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {state.archiveStats && state.archive && (
          <FileUploadDialog
            supabase={supabase}
            isOpen={state.isDialogOpen}
            onClose={() =>
              setState((prev) => ({ ...prev, isDialogOpen: false }))
            }
            archive={state.archive}
          />
        )}
      </div>
    )
  )
}

const deleteStorageFiles = async (
  supabase: SupabaseClient<Database>,
  providerId: string,
) => {
  const { data: fileList, error: listError } = await supabase.storage
    .from('archives')
    .list(providerId)

  if (listError) throw listError

  if (fileList && fileList.length > 0) {
    const filesToDelete = fileList.map(
      (file: { name: string }) => `${providerId}/${file.name}`,
    )
    const { error: deleteError } = await supabase.storage
      .from('archives')
      .remove(filesToDelete)

    if (deleteError) throw deleteError
  }
}
