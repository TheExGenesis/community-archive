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
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setUser(session?.user || null)
    }

    getCurrentUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
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
            password: 'devpassword123',
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
      const uploadedArchive = await handleFileUpload(
        event,
        setIsUploadProcessing,
      )
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
      description:
        'Go to X Settings and request your archive. It takes 1-2 days.',
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
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-foreground">
          Upload your tweets
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          Contribute to collective intelligence research{' '}
          <br className="hidden sm:block" />
          to build on top of our data and access our tools.
        </p>
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
        {steps.map((step) => (
          <div
            key={step.number}
            className="rounded-xl border border-border bg-card p-6 text-center"
          >
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg font-bold text-brand">
              {step.number}
            </div>
            <h3 className="mb-2 font-semibold text-foreground">{step.title}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {step.description}
            </p>

            {step.link && (
              <a
                href={step.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-sm text-brand hover:underline"
              >
                {step.linkText}
                <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            )}

            {step.isUpload && (
              <>
                <Button
                  onClick={handleUploadClick}
                  disabled={isUploadProcessing}
                  className="bg-brand text-white hover:bg-brand/90 dark:bg-brand dark:text-brand-foreground dark:hover:bg-brand/90"
                >
                  <Upload className="mr-2 h-4 w-4" />
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

      <p className="mt-6 text-center text-sm text-muted-foreground">
        See{' '}
        <a
          href="https://github.com/TheExGenesis/community-archive/blob/main/docs/archive_data.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline"
        >
          what data we use
        </a>{' '}
        from your archive
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
