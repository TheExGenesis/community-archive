'use client'

import { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { createAdminBrowserClient } from '@/utils/supabase'
import { refreshSession } from '@/lib-client/refreshSession'
import { processTwitterArchive } from '@/lib-client/db_insert'
import UploadTwitterArchive from '@/components/UploadTwitterArchive'
import { devLog } from '@/lib-client/devLog'

const JsonUploadForm = (props: { supabase: SupabaseClient }) => {
  const [file, setFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<{
    phase: string
    percent: number | null
  }>({ phase: '', percent: null })

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFile(event.target.files[0])
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) return

    setIsProcessing(true)
    const reader = new FileReader()

    reader.onload = async (e) => {
      try {
        const archiveData = JSON.parse(e.target?.result as string)
        devLog('archiveData', archiveData)
        const supabase = createAdminBrowserClient()

        await processTwitterArchive(supabase, archiveData, (progress) => {
          setProgress(progress)
        })

        alert('Archive processed successfully!')
      } catch (error) {
        console.error('Error processing archive:', error)
        alert('An error occurred while processing the archive.')
      } finally {
        setIsProcessing(false)
        setProgress({ phase: '', percent: null })
      }
    }

    reader.readAsText(file)
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <input
        type="file"
        accept=".json"
        onChange={handleFileChange}
        disabled={isProcessing}
        className="mb-2"
      />
      <button
        type="submit"
        disabled={!file || isProcessing}
        className="rounded bg-blue-500 px-4 py-2 text-white disabled:opacity-50"
      >
        {isProcessing ? 'Processing...' : 'Process JSON'}
      </button>
      {isProcessing && progress.phase && (
        <div className="mt-2">
          <p>{progress.phase}</p>
          {progress.percent !== null && (
            <div className="w-full rounded bg-gray-200">
              <div
                className="rounded bg-blue-600 p-0.5 text-center text-xs font-medium leading-none text-blue-100"
                style={{ width: `${progress.percent}%` }}
              >
                {progress.percent.toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  )
}
import { createClient } from '@supabase/supabase-js'

const AdminUploadPage = () => {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null)

  useEffect(() => {
    const initializeSupabase = async () => {
      if (isDevelopment) {
        // const adminClient = createAdminBrowserClient()
        const adminClient = createClient(
          'http://localhost:54321',
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
              detectSessionInUrl: false,
            },
          },
        )

        try {
          // await refreshSession(adminClient)
          setSupabase(adminClient)
        } catch (error) {
          console.error('Error refreshing session:', error)
        }
      }
    }

    initializeSupabase()
  }, [isDevelopment])

  if (!isDevelopment) {
    return <div>This page is only available in development mode.</div>
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-6 text-2xl font-bold">Admin Upload</h1>
      <h2 className="mb-4 text-xl font-semibold">
        Upload community archive json
      </h2>
      {supabase && <JsonUploadForm supabase={supabase} />}

      <h2 className="mb-4 mt-8 text-xl font-semibold">
        Upload twitter archive zip
      </h2>
      {supabase && <UploadTwitterArchive supabase={supabase} />}
    </div>
  )
}

export default AdminUploadPage
