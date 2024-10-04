import { devLog } from '../devLog'

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
export const validateContent = (content: string, expectedSchema: any) => {
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

export const validateFileContents = (fileContents: {
  [key: string]: string[]
}): void => {
  Object.entries(fileContents).forEach(([fileName, contents]) => {
    devLog('Validating file:', fileName)
    const schemas = expectedSchemas[fileName as keyof typeof expectedSchemas]
    const isValid = Array.isArray(contents)
      ? contents.every((content) => validateContent(content, schemas))
      : validateContent(contents as any, schemas)
    if (!isValid) {
      throw new Error(`Invalid schema for ${fileName}`)
    }
  })
}
