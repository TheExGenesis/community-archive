'use client'

import { Button } from '@/components/ui/button'
import { FileDown } from 'lucide-react'
import { createBrowserClient } from '@/utils/supabase'

export function DownloadArchiveButton({ username }: { username: string }) {
  const handleDownload = async () => {
    try {
      const supabase = createBrowserClient()
      const { data: blob, error } = await supabase.storage
        .from('archives')
        .download(`${username.toLowerCase()}/archive.json`)

      if (error) throw error

      // Create a temporary link element
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `${username}_twitter_archive.json` // Set filename

      // Trigger download
      document.body.appendChild(link)
      link.click()

      // Cleanup
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  return (
    <div className="mt-4">
      <Button
        variant="outline"
        onClick={handleDownload}
        className="flex items-center gap-2"
      >
        <FileDown size={16} />
        Download Raw Archive
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">
        Downloads the complete Twitter archive in JSON format. Sign-in is
        required.
      </p>
    </div>
  )
}
