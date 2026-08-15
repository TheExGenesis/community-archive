export interface ArchiveMediaEntity {
  id?: string | number
  id_str?: string
  media_url?: string
  media_url_https?: string
  type?: string
  sizes?: {
    large?: {
      w?: number
      h?: number
    }
  }
}

interface ArchiveTweetWithMedia {
  entities?: { media?: ArchiveMediaEntity[] }
  extended_entities?: { media?: ArchiveMediaEntity[] }
}

/**
 * Twitter archives keep only the first attachment in entities.media for some
 * multi-image tweets. extended_entities.media is the complete collection.
 */
export function getArchiveTweetMedia(
  tweet: ArchiveTweetWithMedia,
): ArchiveMediaEntity[] {
  const extendedMedia = tweet.extended_entities?.media
  if (extendedMedia?.length) return extendedMedia

  return tweet.entities?.media ?? []
}
