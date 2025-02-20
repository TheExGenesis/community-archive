'use client'

import { Button } from '@/components/ui/button'
import { FileDown } from 'lucide-react'
import { useEffect, useState } from 'react'

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function DownloadArchiveButton({ username }: { username: string }) {
  const archiveUrl = `https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/archives/${username.toLowerCase()}/archive.json`

  return (
    <div className="mt-4">
      <Button 
        variant="outline" 
        onClick={() => window.open(archiveUrl, '_blank')}
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