import { Archive, UploadOptions } from '../types'



export const emptyLikesList = (archive: Archive): Archive => ({
  ...archive,
  like: [],
})

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
