import { pipe } from '@/lib/fp'
import { devLog } from '../devLog'
import { Archive } from '../types'
import { validateContent, validateFileContents } from './validateContent'
import { BlobReader, ZipReader, TextWriter } from '@zip.js/zip.js'
import { removeProblematicCharacters } from '../removeProblematicChars'

export const requiredFiles = [
  'profile',
  'account',
  'tweets',
  'follower',
  'following',
]

export const optionalFiles = ['note-tweet', 'like', 'community-tweet']

export const requiredFilePaths = requiredFiles.map((file) => `data/${file}.js`)

const isZipFile = (file: File): boolean =>
  file.type === 'application/zip' ||
  file.type === 'application/x-zip-compressed' ||
  file.type === 'application/octet-stream' ||
  file.name.toLowerCase().endsWith('.zip')

const extractZipContents = async (
  file: File,
): Promise<{ [key: string]: string[] }> => {
  const zipReader = new ZipReader(new BlobReader(file))
  const entries = await zipReader.getEntries()

  const tweetPartFilePaths = entries
    .filter((e) => e.filename.includes('tweets-part'))
    .map((e) => e.filename.match(/tweets-part\d+/)?.[0] ?? '')
    .filter(Boolean)

  const likePartFilePaths = entries
    .filter((e) => e.filename.includes('like-part'))
    .map((e) => e.filename.match(/like-part\d+/)?.[0] ?? '')
    .filter(Boolean)

  const followingPartFilePaths = entries
    .filter((e) => e.filename.includes('following-part'))
    .map((e) => e.filename.match(/following-part\d+/)?.[0] ?? '')
    .filter(Boolean)

  const followerPartFilePaths = entries
    .filter((e) => e.filename.includes('follower-part'))
    .map((e) => e.filename.match(/follower-part\d+/)?.[0] ?? '')
    .filter(Boolean)

  const allFilePaths = [
    ...requiredFiles,
    ...optionalFiles,
    ...tweetPartFilePaths,
    ...likePartFilePaths,
    ...followingPartFilePaths,
    ...followerPartFilePaths,
  ].map((file) => `data/${file}.js`)

  const fileContents: { [key: string]: string[] } = {}

  for (const fileName of allFilePaths) {
    const matchingEntries = entries.filter(
      (e) =>
        e.filename.includes(fileName) ||
        e.filename.includes(fileName.replace('tweets.js', 'tweet.js')),
    )

    if (matchingEntries.length > 0) {
      for (const entry of matchingEntries) {
        if (entry.getData) {
          const writer = new TextWriter()
          const content = await entry.getData(writer)
          const name = entry.filename.includes('data/tweets-part')
            ? 'tweets'
            : entry.filename.includes('data/like-part')
              ? 'like'
              : entry.filename.includes('data/following-part')
                ? 'following'
                : entry.filename.includes('data/follower-part')
                  ? 'follower'
                  : fileName.slice(5, -3)
          if (!fileContents[name]) {
            fileContents[name] = []
          }
          fileContents[name].push(content)
        }
      }
    } else if (requiredFilePaths.includes(fileName)) {
      throw new Error(`Required file ${fileName} not found in the zip`)
    }
  }

  await zipReader.close()
  return fileContents
}

const parseFileContents = (fileContents: {
  [key: string]: string[]
}): Archive => {
  const archive: Archive = Object.fromEntries(
    Object.entries(fileContents).map(([key, contents]) => {
      try {
        if (
          [
            'tweets',
            'like',
            'follower',
            'following',
            'community-tweet',
          ].includes(key)
        ) {
          const allItems = contents.flatMap((content, index) =>
            pipe(
              (content) => content.slice(content.indexOf('[')),
              removeProblematicCharacters,
              JSON.parse,
            )(content),
          )
          return [key, allItems]
        } else {
          return [
            key,
            pipe(
              (content) => content.slice(content.indexOf('[')),
              removeProblematicCharacters,
              JSON.parse,
            )(contents[0]),
          ]
        }
      } catch (error) {
        throw new Error(`Error parsing ${key}.js: ${(error as Error).message}`)
      }
    }),
  ) as Archive

  return {
    ...archive,
    like: archive.like || [],
    account: archive.account.map(({ account }: any) => {
      const { email, ...rest } = account
      return { account: rest }
    }),
  }
}

export const handleFileUpload = async (
  event: React.ChangeEvent<HTMLInputElement>,
  setIsProcessing: (isProcessing: boolean) => void,
): Promise<Archive> => {
  const files = event.target.files
  if (!files || files.length === 0) throw new Error('No files uploaded')

  setIsProcessing(true)
  let error: Error | undefined
  try {
    const file = files[0]

    if (!isZipFile(file)) {
      throw new Error(
        `Please upload a zip file, your file type is ${file.type}`,
      )
    }

    const fileContents = await extractZipContents(file)
    validateFileContents(fileContents)

    const archive = parseFileContents(fileContents)

    const sizeInMB = JSON.stringify(archive).length / (1024 * 1024)
    devLog(`Size of archive: ${sizeInMB.toFixed(2)} MB`)
    devLog('archive', { archive })
    setIsProcessing(false)
    if (event.target) {
      event.target.value = ''
    }

    return archive
  } catch (error) {
    setIsProcessing(false)
    if (event.target) {
      event.target.value = ''
    }
    console.error('Error loading the archive:', error)

    throw error
  }
}
