'use client'

import { useState } from 'react'
import { processTwitterArchive } from '../lib-server/db_insert'
import { createBrowserClient } from '@/utils/supabase'

type CustomInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string
  directory?: string
}

const requiredFiles = ['profile', 'account', 'tweets', 'follower', 'following']

const requiredFilePaths = requiredFiles.map((file) => `data/${file}.js`)

// Validation step
const validateContent = (content: string, expectedSchema: any) => {
  console.log('Validating content...', content.split('\n')[0])
  const dataJson = content.slice(content.indexOf('['))
  let data
  try {
    data = JSON.parse(dataJson)
  } catch (error) {
    console.error('Error parsing JSON:', error)
    return false
  }

  if (!Array.isArray(data)) {
    console.error('Data is not an array')
    return false
  }

  return data.every((item) => {
    if (typeof item !== 'object' || item === null) {
      console.error('Item is not an object:', item)
      return false
    }
    return Object.keys(expectedSchema).every((key) => key in item)
  })
}

// ... rest of the code remains the same ...
const expectedSchemas = {
  profile: {
    profile: {
      description: {
        bio: '',
        website: '',
        location: '',
      },
      avatarMediaUrl: '',
      headerMediaUrl: '',
    },
  },
  account: {
    account: {
      // email: '',
      createdVia: '',
      username: '',
      accountId: '',
      createdAt: '',
      accountDisplayName: '',
    },
  },
  tweets: {
    tweet: {
      id: '',
      retweeted: false,
      source: '',
      entities: {},
      favorite_count: '',
      id_str: '',
      retweet_count: '',
      created_at: '',
      favorited: false,
      full_text: '',
    },
  },
  follower: { follower: { accountId: '', userLink: '' } },
  following: { following: { accountId: '', userLink: '' } },
}

export default function UploadTwitterArchive() {
  const supabase = createBrowserClient()
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<number>(0)

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setIsProcessing(true)
    setProgress(0)

    const fileContents: { [key: string]: string } = {}

    try {
      const file = files[0]
      const totalFiles = requiredFilePaths.length
      let processedFiles = 0

      if (file.type === 'application/zip') {
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(file)

        for (const fileName of requiredFilePaths) {
          if (!fileName.startsWith('data/') || !fileName.endsWith('.js')) {
            throw new Error(`Invalid filename format: ${fileName}`)
          }
          const zipFile =
            zip.file(fileName) ||
            zip.file(fileName.replace('tweets.js', 'tweet.js'))
          if (!zipFile) {
            throw new Error(`Required file ${fileName} not found in the zip`)
          }
          const content = await zipFile.async('string')
          const name = fileName.slice(5, -3)
          fileContents[name] = content

          processedFiles++
          setProgress((processedFiles / totalFiles) * 100)
        }
      } else if (file.webkitRelativePath) {
        for (const fileName of requiredFilePaths) {
          const filePath = `${
            file.webkitRelativePath.split('/')[0]
          }/${fileName}`
          const fileEntry = Array.from(event.target.files || []).find(
            (f) => f.webkitRelativePath === filePath,
          )
          if (!fileEntry) {
            throw new Error(
              `Required file ${fileName} not found in the directory`,
            )
          }
          const name = fileName.slice(5, -3)
          fileContents[name] = await fileEntry.text()

          processedFiles++
          setProgress((processedFiles / totalFiles) * 100)
        }
      } else {
        throw new Error('Please upload a zip file or a directory')
      }

      console.log('Extracted files:', Object.keys(fileContents))

      for (const [fileName, content] of Object.entries(fileContents)) {
        console.log('Validating file:', fileName)
        if (
          !validateContent(
            content,
            expectedSchemas[fileName as keyof typeof expectedSchemas],
          )
        ) {
          throw new Error(`Invalid schema for ${fileName}`)
        }
      }

      const archive = JSON.stringify(
        Object.fromEntries(
          Object.entries(fileContents).map(([key, content]) => [
            key,
            JSON.parse(content.slice(content.indexOf('['))),
          ]),
        ),
      )
      console.log('archive:', archive)
      console.log('archive obj:', JSON.parse(archive))

      await processTwitterArchive(supabase, JSON.parse(archive))
      alert('Archive processed successfully')
    } catch (error) {
      console.error('Error processing archive:', error)
      alert('An error occurred while processing archive')
    } finally {
      setIsProcessing(false)
      setProgress(0)
    }
  }

  return (
    <div>
      <input
        type="file"
        accept=".js,.zip"
        onChange={handleFileUpload}
        disabled={isProcessing}
        webkitdirectory=""
        directory=""
        multiple
        {...({} as CustomInputProps)}
      />
      {isProcessing && (
        <div>
          <p>Processing archive...</p>
        </div>
      )}
    </div>
  )
}
