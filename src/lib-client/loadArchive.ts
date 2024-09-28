import { processTwitterArchive } from '@/lib-server/db_insert'
import { createBrowserClient } from '@/utils/supabase'
import { getSchemaName } from './getTableName'
import { ArchiveStats, Archive, UploadOptions } from './types'
import { pipe } from 'fp-ts/lib/function'

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

/**
 * Filters the tweets in the archive based on the provided date range.
 *
 * @param archive - The archive to filter.
 * @param startDate - The start date in ISO format.
 * @param endDate - The end date in ISO format.
 * @returns A new archive with tweets filtered by the specified date range.
 */
export const filterArchiveTweetsByDate = (
  archive: Archive,
  startDate: string,
  endDate: string,
): Archive => {
  const start = new Date(startDate)
  const end = new Date(endDate)

  const filteredTweets = archive.tweets.filter((tweet) => {
    const tweetDate = new Date(tweet.tweet.created_at)
    return tweetDate >= start && tweetDate <= end
  })

  return {
    ...archive,
    tweets: filteredTweets,
  }
}

/**
 * Empties the likes list in the archive.
 *
 * @param archive - The archive to modify.
 * @returns A new archive with an empty likes list.
 */
export const emptyLikesList = (archive: Archive): Archive => ({
  ...archive,
  like: [],
})

export const applyOptionsToArchive = (
  _archive: Archive,
  options: UploadOptions,
): Archive => {
  let archive = _archive
  if (options.startDate && options.endDate) {
    archive = filterArchiveTweetsByDate(
      archive,
      options.startDate.toISOString(),
      options.endDate.toISOString(),
    )
  }
  if (options.keepPrivate) {
    archive = emptyLikesList(archive)
  }
  if (options.uploadLikes) {
    archive = emptyLikesList(archive)
  }
  return { 'upload-options': options, ...archive }
}

export const handleFileUpload = async (
  event: React.ChangeEvent<HTMLInputElement>,
  setIsProcessing: (isProcessing: boolean) => void,
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

    let archive: Archive = Object.fromEntries(
      Object.entries(fileContents).map(([key, content]) => [
        key,
        JSON.parse(content.slice(content.indexOf('['))),
      ]),
    ) as Archive

    archive = {
      ...archive,
      account: archive.account.map((item: { account: any }) => {
        const { email, ...rest } = item.account
        return { account: rest }
      }),
    }
    const sizeInMB = JSON.stringify(archive).length / (1024 * 1024)
    console.log(`Size of archive: ${sizeInMB.toFixed(2)} MB`, archive)

    // Clear the archive data from memory
    // Clear all archive objects from memory
    Object.keys(fileContents).forEach((key) => delete fileContents[key])

    setIsProcessing(false)
    return archive

    // window.location.reload() // Reload the page after successful insertion
  } catch (error) {
    console.error('Error loading the archive:', error)
    alert('An error occurred while processing archive')
  } finally {
    setIsProcessing(false)
    // Ensure file input is cleared
    if (event.target) {
      event.target.value = ''
    }
  }
}

export const uploadArchiveToStorage = async (
  archive: Archive,
  accountId: string,
  archiveId: string,
): Promise<void> => {
  const supabase = createBrowserClient()
  const archiveSize = JSON.stringify(archive).length / (1024 * 1024)
  console.log(`Size of archive: ${archiveSize.toFixed(2)} MB`)

  console.log('Uploading archive to storage', { accountId, archiveId })

  const { data: refreshdata, error: refreshError } =
    await supabase.auth.refreshSession()
  if (refreshError) {
    console.error('Error refreshing session:', refreshError)
    throw refreshError
  }
  console.log('Refreshed session:', refreshdata)

  const bucketName =
    process.env.NODE_ENV === 'production' ? 'archives' : 'dev_archives'
  const { data, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(`${accountId}/${archiveId}.json`, JSON.stringify(archive), {
      upsert: true,
    })
  if (uploadError && uploadError.message !== 'The resource already exists') {
    throw new Error(
      `Error uploading archive to storage: ${uploadError.message}`,
    )
  }
}

export const fetchArchiveUpload = async (
  setArchiveUpload: any,
  userMetadata: any,
) => {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .schema(getSchemaName())
    .from('archive_upload')
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

export const uploadArchive = async (
  progressCallback: (progress: {
    phase: string
    percent: number | null
  }) => void,
  archive: Archive,
) => {
  const supabase = createBrowserClient()
  const latestTweetDate = archive.tweets.reduce(
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
  const username = archive.account[0].account.username
  const archiveId = `${username}_${latestTweetDate}`
  console.log('Uploading archive', archiveId)
  progressCallback({ phase: 'Uploading archive', percent: 0 })

  // Use the new function here
  await uploadArchiveToStorage(
    archive,
    archive.account[0].account.accountId,
    archiveId,
  )

  // Process the archive
  await processTwitterArchive(supabase, archive, progressCallback)
}

export const calculateArchiveStats = (archive: Archive): ArchiveStats => {
  const username = archive.account[0].account.username
  const accountDisplayName = archive.account[0].account.accountDisplayName
  const avatarMediaUrl = archive.profile[0].profile.avatarMediaUrl
  const tweetCount = archive.tweets.length
  const likesCount = archive.like.length
  const followerCount = archive.follower.length
  const earliestTweetDate = archive.tweets.reduce(
    (earliest: string, tweet: any) => {
      const tweetDate = new Date(tweet.tweet.created_at)
      return earliest
        ? tweetDate < new Date(earliest)
          ? tweetDate.toISOString()
          : earliest
        : tweetDate.toISOString()
    },
    '',
  )
  const latestTweetDate = archive.tweets.reduce(
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

  return {
    username,
    accountDisplayName,
    avatarMediaUrl,
    tweetCount,
    likesCount,
    followerCount,
    earliestTweetDate,
    latestTweetDate,
  }
}
