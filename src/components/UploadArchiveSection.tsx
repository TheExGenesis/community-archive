'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { createBrowserClient } from '@/utils/supabase'
import { Upload, ExternalLink } from 'lucide-react'
import { devLog } from '@/lib/devLog'
import { handleFileUpload } from '@/lib/upload-archive/handleFileUpload'
import { FileUploadDialog } from './file-upload-dialog'
import { Archive } from '@/lib/types'
import { calculateArchiveStats } from '@/lib/upload-archive/calculateArchiveStats'

export default function UploadArchiveSection() {
  const { userMetadata } = useAuthAndArchive()
  const supabase = createBrowserClient()

  const [user, setUser] = useState<any>(null)
  const [isUploadProcessing, setIsUploadProcessing] = useState(false)
  const [archive, setArchive] = useState<Archive | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Get current user session
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user || null)
    }

    getCurrentUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  // Handle archive stats calculation
  useEffect(() => {
    if (archive) {
      calculateArchiveStats(archive)
      setIsDialogOpen(true)
    }
  }, [archive])

  const signIn = async () => {
    devLog('sign in for upload')

    if (process.env.NODE_ENV === 'development') {
      try {
        const response = await fetch('/api/auth/dev-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'dev@example.com',
            password: 'devpassword123'
          }),
        })

        const result = await response.json()
        if (!response.ok) {
          console.error('Dev login failed:', result.error)
          return
        }

        devLog('Dev login successful:', result)
        window.location.reload()
      } catch (error) {
        console.error('Error during dev sign in:', error)
      }
    } else {
      const callbackUrl = `${window.location.origin}/api/auth/callback?next=${encodeURIComponent('/?action=upload')}`

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'twitter',
        options: { redirectTo: callbackUrl },
      })

      if (error) {
        console.error('Error signing in with Twitter:', error)
      }
    }
  }

  const handleUploadClick = () => {
    if (!user) {
      signIn()
      return
    }

    fileInputRef.current?.click()
  }

  const onFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsUploadProcessing(true)

    try {
      const uploadedArchive = await handleFileUpload(event, setIsUploadProcessing)
      devLog('archive', uploadedArchive)
      setArchive(uploadedArchive)
    } catch (error) {
      console.error('Error processing archive:', error)
      alert(`Error processing archive: ${(error as Error).message}`)
    } finally {
      setIsUploadProcessing(false)
      if (event.target) {
        event.target.value = ''
      }
    }
  }

  const steps = [
    {
      number: '1',
      title: 'Request your data',
      description: 'Go to X Settings and request your archive. It takes 1-2 days.',
      link: 'https://x.com/settings/download_your_data',
      linkText: 'Request Archive',
    },
    {
      number: '2',
      title: 'Download from email',
      description: 'X will email you when your archive is ready to download.',
    },
    {
      number: '3',
      title: 'Upload here',
      description: 'Upload the .zip file to add your data to the archive.',
      isUpload: true,
    },
  ]

  return (
    <div className="w-full">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">Upload Your Archive</h2>
        <p className="mt-3 text-lg text-gray-600 dark:text-gray-300">
          Add your full Twitter history to the archive
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {steps.map((step) => (
          <div
            key={step.number}
            className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700 text-center"
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-lg flex items-center justify-center mx-auto mb-4">
              {step.number}
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{step.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{step.description}</p>

            {step.link && (
              <a
                href={step.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {step.linkText}
                <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            )}

            {step.isUpload && (
              <>
                <Button
                  onClick={handleUploadClick}
                  disabled={isUploadProcessing}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploadProcessing ? 'Processing...' : 'Upload .zip'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  onChange={onFileUpload}
                  disabled={isUploadProcessing}
                  multiple
                  className="hidden"
                />
              </>
            )}
          </div>
        ))}
      </div>

      <p className="text-center mt-6 text-sm text-gray-500 dark:text-gray-400">
        See{' '}
        <a
          href="https://github.com/TheExGenesis/community-archive/blob/main/docs/archive_data.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          what data we use
        </a>
        {' '}from your archive
      </p>

      {/* Upload Dialog */}
      {archive && (
        <FileUploadDialog
          supabase={supabase}
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          archive={archive}
        />
      )}
    </div>
  )
}
