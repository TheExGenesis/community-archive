'use client'

import React, { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { handleFileUpload } from '@/lib/upload-archive/handleFileUpload'
import { Archive } from '@/lib/types'
import { createBrowserClient } from '@/utils/supabase'
import { FileUploadDialog } from './file-upload-dialog'

type ArchiveUploadButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  'disabled' | 'onClick'
>

export function ArchiveUploadButton({
  children,
  ...buttonProps
}: ArchiveUploadButtonProps) {
  const supabase = createBrowserClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [archive, setArchive] = useState<Archive | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const onFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsProcessing(true)

    try {
      const uploadedArchive = await handleFileUpload(event, setIsProcessing)
      setArchive(uploadedArchive)
      setIsDialogOpen(true)
    } catch (error) {
      console.error('Error processing archive:', error)
      alert(`Error processing archive: ${(error as Error).message}`)
    } finally {
      setIsProcessing(false)
      event.target.value = ''
    }
  }

  return (
    <>
      <Button
        {...buttonProps}
        onClick={() => fileInputRef.current?.click()}
        disabled={isProcessing}
      >
        <Upload className="h-4 w-4" />
        {isProcessing ? 'Processing...' : children}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={onFileUpload}
        disabled={isProcessing}
        multiple
        className="hidden"
        aria-label="Choose Twitter archive zip"
      />
      {archive && (
        <FileUploadDialog
          supabase={supabase}
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          archive={archive}
        />
      )}
    </>
  )
}
