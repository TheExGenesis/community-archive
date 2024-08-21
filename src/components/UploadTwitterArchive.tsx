'use client'

import { useState, useEffect } from 'react'
import { processTwitterArchive, deleteArchive } from '../lib-server/db_insert'
import { createBrowserClient } from '@/utils/supabase'
import { getTableName } from '@/lib-client/getTableName'

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

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const handleFileUpload = async (
  event: React.ChangeEvent<HTMLInputElement>,
  setIsProcessing: (isProcessing: boolean) => void,
  supabase: any,
) => {
  const files = event.target.files
  if (!files || files.length === 0) return

  setIsProcessing(true)

  const fileContents: { [key: string]: string } = {}

  try {
    const file = files[0]

    if (file.type === 'application/zip') {
      const { BlobReader, ZipReader, TextWriter } = await import(
        '@zip.js/zip.js'
      )
      const zipReader = new ZipReader(new BlobReader(file))
      const entries = await zipReader.getEntries()

      const rootDir = entries[0].filename.split('/')[0]

      for (const fileName of requiredFilePaths) {
        const entry = entries.find(
          (e) =>
            e.filename === `${rootDir}/${fileName}` ||
            e.filename ===
              `${rootDir}/${fileName}`.replace('tweets.js', 'tweet.js'),
        )

        if (!entry) {
          throw new Error(
            `Required file ${`${rootDir}/${fileName}`} not found in the zip`,
          )
        }

        if (entry && entry.getData) {
          const writer = new TextWriter()
          const content = await entry.getData(writer)
          const name = fileName.slice(5, -3)
          fileContents[name] = content
        } else {
          throw new Error(`Unable to read file: ${fileName}`)
        }
      }

      await zipReader.close()
    } else if (file.webkitRelativePath) {
      for (const fileName of requiredFilePaths) {
        const filePath = `${file.webkitRelativePath.split('/')[0]}/${fileName}`
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
      }
    } else {
      throw new Error('Please upload a zip file')
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

    // Process the archive
    await processTwitterArchive(supabase, JSON.parse(archive))

    // Clear the archive data from memory
    Object.keys(fileContents).forEach((key) => delete fileContents[key])

    alert('Archive processed successfully')
    window.location.reload() // Reload the page after successful deletion
  } catch (error) {
    console.error('Error processing archive:', error)
    alert('An error occurred while processing archive')
  } finally {
    setIsProcessing(false)
    // Ensure file input is cleared
    if (event.target) {
      event.target.value = ''
    }
  }
}

const fetchArchiveUpload = async (setArchiveUpload: any, userMetadata: any) => {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from(getTableName('archive_upload') as 'archive_upload')
    .select('archive_at')
    .eq('account_id', userMetadata.provider_id)
    .order('archive_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Error fetching archive upload:', error)
    return
  }
  if (data && data.length > 0) {
    setArchiveUpload(data[0] as { archive_at: string })
  }
}

export default function UploadTwitterArchive({
  userMetadata,
}: {
  userMetadata: any
}) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [archiveUpload, setArchiveUpload] = useState<{
    archive_at: string
  } | null>(null)
  const [showUploadButton, setShowUploadButton] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    fetchArchiveUpload(setArchiveUpload, userMetadata)
  }, [userMetadata])

  const onFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const supabase = createBrowserClient()
    await handleFileUpload(event, setIsProcessing, supabase)
  }

  const onDeleteArchive = async () => {
    if (
      window.confirm(
        'Are you sure you want to delete your archive? This action cannot be undone.',
      )
    ) {
      setIsDeleting(true)
      const supabase = createBrowserClient()
      try {
        await deleteArchive(supabase, userMetadata.provider_id)
        setArchiveUpload(null)
        alert('Archive deleted successfully')
        window.location.reload() // Reload the page after successful deletion
      } catch (error) {
        console.error('Error deleting archive:', error)
        alert('An error occurred while deleting the archive')
      } finally {
        setIsDeleting(false)
      }
    }
  }

  return (
    <div>
      {archiveUpload && (
        <>
          <p>
            Your last archive upload was from{' '}
            {formatDate(archiveUpload.archive_at)}.
          </p>
        </>
      )}
      {archiveUpload && !showUploadButton ? (
        <div>
          <button
            onClick={() => setShowUploadButton(true)}
            className="cursor-pointer text-blue-500 underline"
          >
            Upload a new archive, or delete your data.
          </button>
        </div>
      ) : (
        <div>
          {archiveUpload && (
            <div>
              <button
                onClick={() => setShowUploadButton(false)}
                className="cursor-pointer text-blue-500 underline"
              >
                Close
              </button>
            </div>
          )}
          <div className="flex flex-col">
            <div className="flex justify-between">
              <div className="mb-4">
                <p className="mb-4 text-sm">
                  Please upload your Twitter archive (as a .zip file).
                </p>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={onFileUpload}
                  disabled={isProcessing}
                  // webkitdirectory=""
                  // directory=""
                  // {...({} as CustomInputProps)}
                  multiple
                />
                {isProcessing && (
                  <div>
                    <p>Processing archive...</p>
                  </div>
                )}
              </div>
              <div>
                {archiveUpload && (
                  <>
                    <p className="mb-4 text-sm">
                      This will delete all your data
                    </p>
                    <button
                      onClick={onDeleteArchive}
                      disabled={isDeleting}
                      className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      {isDeleting ? 'Deleting...' : 'Delete My Archive'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
