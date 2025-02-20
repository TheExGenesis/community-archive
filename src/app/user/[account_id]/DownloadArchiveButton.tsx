'use client'

import { Button } from '@/components/ui/button'
import { FileDown } from 'lucide-react'

export function DownloadArchiveButton({ username }: { username: string }) {
  const archiveUrl = `https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/archives/${username.toLowerCase()}/archive.json`

  const handleDownload = async () => {
    try {
      // Fetch the file
      const response = await fetch(archiveUrl)
      const blob = await response.blob()
      
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
      <p className="mt-1 text-xs text-gray-500">
        Downloads the complete Twitter archive in JSON format
      </p>
    </div>
  )
} 