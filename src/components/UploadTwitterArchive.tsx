'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { processTwitterArchive, deleteArchive } from '../lib-server/db_insert'
import { createBrowserClient } from '@/utils/supabase'
import { getSchemaName, getTableName } from '@/lib-client/getTableName'

type CustomInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string
  directory?: string
}

const requiredFiles = [
  'profile',
  'account',
  'tweets',
  'community-tweet',
  'like',
  'follower',
  'following',
]

const optionalFiles = ['note-tweet']

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
  'community-tweet': {
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
  like: { like: { tweetId: '', fullText: '' } },
  'note-tweet': {
    noteTweet: {
      noteTweetId: '',
      updatedAt: '',
      lifecycle: {
        value: '',
        name: '',
        originalName: '',
        annotations: {},
      },
      createdAt: '',
      core: {
        styletags: [],
        urls: [],
        text: '',
        mentions: [],
        cashtags: [],
        hashtags: [],
      },
    },
  },
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const uploadArchiveToStorage = async (
  supabase: any,
  archiveToUpload: any,
  accountId: string,
  archiveId: string,
): Promise<void> => {
  const archiveToUploadSize =
    JSON.stringify(archiveToUpload).length / (1024 * 1024)
  console.log(`Size of archiveToUpload: ${archiveToUploadSize.toFixed(2)} MB`)

  console.log('Uploading archive to storage', { accountId, archiveId })
  const { data, error: uploadError } = await supabase.storage
    .from('archives')
    .upload(`${accountId}/${archiveId}.json`, JSON.stringify(archiveToUpload), {
      upsert: true,
    })
  if (uploadError && uploadError.message !== 'The resource already exists') {
    throw new Error(
      `Error uploading archive to storage: ${uploadError.message}`,
    )
  }
}

const handleFileUpload = async (
  event: React.ChangeEvent<HTMLInputElement>,
  setIsProcessing: (isProcessing: boolean) => void,
  supabase: any,
  progressCallback: (progress: { phase: string; percent: number }) => void,
) => {
  const files = event.target.files
  if (!files || files.length === 0) return

  setIsProcessing(true)

  const fileContents: { [key: string]: string } = {}

  try {
    const file = files[0]

    if (
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed' ||
      file.type === 'application/octet-stream' ||
      file.name.toLowerCase().endsWith('.zip')
    ) {
      const { BlobReader, ZipReader, TextWriter } = await import(
        '@zip.js/zip.js'
      )
      const zipReader = new ZipReader(new BlobReader(file))
      const entries = await zipReader.getEntries()

      // console.log('entries', entries)

      const allFilePaths = [
        ...requiredFilePaths,
        ...optionalFiles.map((file) => `data/${file}.js`),
      ]

      for (const fileName of allFilePaths) {
        const entry = entries.find(
          (e) =>
            e.filename.includes(fileName) ||
            e.filename.includes(fileName.replace('tweets.js', 'tweet.js')),
        )

        if (entry && entry.getData) {
          const writer = new TextWriter()
          const content = await entry.getData(writer)
          const name = fileName.slice(5, -3)
          fileContents[name] = content
        } else if (requiredFilePaths.includes(fileName)) {
          throw new Error(`Required file ${fileName} not found in the zip`)
        }
      }

      await zipReader.close()
    } else if (file.webkitRelativePath) {
      const allFilePaths = [
        ...requiredFilePaths,
        ...optionalFiles.map((file) => `data/${file}.js`),
      ]

      for (const fileName of allFilePaths) {
        const filePath = `${file.webkitRelativePath.split('/')[0]}/${fileName}`
        const fileEntry = Array.from(event.target.files || []).find(
          (f) => f.webkitRelativePath === filePath,
        )
        if (fileEntry) {
          const name = fileName.slice(5, -3)
          fileContents[name] = await fileEntry.text()
        } else if (requiredFilePaths.includes(fileName)) {
          throw new Error(
            `Required file ${fileName} not found in the directory`,
          )
        }
      }
    } else {
      throw new Error(
        `Please upload a zip file, your file type is ${file.type}`,
      )
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

    let archiveToUpload = Object.fromEntries(
      Object.entries(fileContents).map(([key, content]) => [
        key,
        JSON.parse(content.slice(content.indexOf('['))),
      ]),
    )
    archiveToUpload = {
      ...archiveToUpload,
      account: archiveToUpload.account.map((item: any) => {
        const { email, ...rest } = item.account
        return { account: rest }
      }),
    }
    const sizeInMB = JSON.stringify(archiveToUpload).length / (1024 * 1024)
    console.log(
      `Size of archiveToUpload: ${sizeInMB.toFixed(2)} MB`,
      archiveToUpload,
    )

    const latestTweetDate = archiveToUpload.tweets.reduce(
      (latest: string, tweet: any) => {
        const tweetDate = new Date(tweet.tweet.created_at)
        return latest
          ? tweetDate > new Date(latest)
            ? tweetDate.toISOString()
            : latest
          : tweetDate.toISOString()
      },
      '',
    )

    // Upload archive objects to storage
    const username = archiveToUpload.account[0].account.username
    const archiveId = `${username}_${latestTweetDate}`
    console.log('Uploading archive', archiveId)
    progressCallback({ phase: 'Uploading archive', percent: 0 })

    // Use the new function here
    await uploadArchiveToStorage(
      supabase,
      archiveToUpload,
      archiveToUpload.account[0].account.accountId,
      archiveId,
    )

    // Process the archive
    await processTwitterArchive(supabase, archiveToUpload, progressCallback)

    // Clear the archive data from memory
    // Clear all archive objects from memory
    Object.keys(fileContents).forEach((key) => delete fileContents[key])
    Object.keys(archiveToUpload).forEach((key) => delete archiveToUpload[key])
    Object.keys(archiveToUpload).forEach((key) => delete archiveToUpload[key])

    alert('Archive processed successfully')
    // window.location.reload() // Reload the page after successful insertion
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
    .schema(getSchemaName())
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
  const isProcessingRef = useRef(isProcessing)

  useEffect(() => {
    isProcessingRef.current = isProcessing
  }, [isProcessing])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessingRef.current) {
        const message =
          'Upload is still in progress. Are you sure you want to leave?'
        e.preventDefault()
        e.returnValue = message
        return message
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  const [archiveUpload, setArchiveUpload] = useState<{
    archive_at: string
  } | null>(null)
  const [showUploadButton, setShowUploadButton] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [progress, setProgress] = useState<{
    phase: string
    percent: number
  } | null>(null)

  const progressCallback = useCallback(
    (progress: { phase: string; percent: number }) => {
      setProgress(progress)
    },
    [],
  )

  useEffect(() => {
    fetchArchiveUpload(setArchiveUpload, userMetadata)
  }, [userMetadata])

  const onFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const supabase = createBrowserClient()
    setIsProcessing(true)
    setProgress(null)

    try {
      await handleFileUpload(event, setIsProcessing, supabase, progressCallback)
    } catch (error) {
      console.error('Error processing archive:', error)
      alert('An error occurred while processing archive')
    } finally {
      setIsProcessing(false)
      setProgress(null)
      if (event.target) {
        event.target.value = ''
      }
    }
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
        // Delete archive from database
        await deleteArchive(supabase, userMetadata.provider_id)

        // Delete everything in the user's directory in storage
        const { data: fileList, error: listError } = await supabase.storage
          .from('archives')
          .list(userMetadata.provider_id)

        if (listError) {
          console.error('Error listing files in storage:', listError)
          throw listError
        }

        if (fileList && fileList.length > 0) {
          const filesToDelete = fileList.map(
            (file) => `${userMetadata.provider_id}/${file.name}`,
          )
          const { error: deleteError } = await supabase.storage
            .from('archives')
            .remove(filesToDelete)

          if (deleteError) {
            console.error('Error deleting files from storage:', deleteError)
            throw deleteError
          }
        }

        setArchiveUpload(null)
        alert('Archive deleted successfully from database and storage')
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
                    <p>{`Processing archive (may take up to 10 minutes)...`}</p>
                    {progress && (
                      <div>
                        <p>
                          {progress.phase}: {progress.percent.toFixed(2)}%
                        </p>
                        <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className="h-2.5 rounded-full bg-blue-600"
                            style={{ width: `${progress.percent}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
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
