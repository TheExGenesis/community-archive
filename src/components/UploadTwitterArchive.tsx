'use client'

import { useState } from 'react'

export default function UploadTwitterArchive() {
  const [isUploading, setIsUploading] = useState(false)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)

    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target?.result as string
      
      try {
        const response = await fetch('/api/upload-tweets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content }),
        })

        if (response.ok) {
          alert('Tweets uploaded successfully!')
        } else {
          alert('Failed to upload tweets')
        }
      } catch (error) {
        console.error('Error uploading tweets:', error)
        alert('An error occurred while uploading tweets')
      }

      setIsUploading(false)
    }

    reader.readAsText(file)
  }

  return (
    <div>
      <input
        type="file"
        accept=".js"
        onChange={handleFileUpload}
        disabled={isUploading}
      />
      {isUploading && <p>Uploading...</p>}
    </div>
  )
}