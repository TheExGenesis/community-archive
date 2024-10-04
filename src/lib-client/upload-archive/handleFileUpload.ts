import { devLog } from '../devLog'
import { Archive } from '../types'
import { validateContent, validateFileContents } from './validateContent'
import { BlobReader, ZipReader, TextWriter } from '@zip.js/zip.js'

export const requiredFiles = [
  'profile',
  'account',
  'tweets',
  'community-tweet',
  'like',
  'follower',
  'following',
]

export const optionalFiles = ['note-tweet']

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

  const allFilePaths = [
    ...requiredFiles,
    ...optionalFiles,
    ...tweetPartFilePaths,
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
      if (key === 'tweets') {
        const allTweets = contents.flatMap((content) =>
          JSON.parse(content.slice(content.indexOf('['))),
        )
        return [key, allTweets]
      } else {
        return [key, JSON.parse(contents[0].slice(contents[0].indexOf('[')))]
      }
    }),
  ) as Archive

  return {
    ...archive,
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
    error = error as Error
    console.error('Error loading the archive:', error)
    alert('An error occurred while processing archive')
    throw error
  }
}
