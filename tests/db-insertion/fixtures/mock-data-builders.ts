import { Tweet, Following, Follower, Like, NoteTweet } from '@/lib/types'

interface TweetOverrides {
  id: string
  text: string
  created_at?: string
  favorite_count?: number
  retweet_count?: number
  reply_to_tweet_id?: string
  reply_to_user_id?: string
  reply_to_username?: string
  entities?: Record<string, any>
  source?: string
}

export const createTweet = (overrides: TweetOverrides) => {
  return {
    id: overrides.id,
    id_str: overrides.id,
    created_at: overrides.created_at || new Date().toISOString(),
    full_text: overrides.text,
    entities: overrides.entities || {
      hashtags: [],
      symbols: [],
      user_mentions: [],
      urls: []
    },
    favorite_count: overrides.favorite_count || 0,
    retweet_count: overrides.retweet_count || 0,
    favorited: false,
    retweeted: false,
    truncated: false,
    source: overrides.source || '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>',
    in_reply_to_status_id_str: overrides.reply_to_tweet_id,
    in_reply_to_status_id: overrides.reply_to_tweet_id,
    in_reply_to_user_id_str: overrides.reply_to_user_id,  
    in_reply_to_user_id: overrides.reply_to_user_id,
    in_reply_to_screen_name: overrides.reply_to_username,
    display_text_range: ["0", String(overrides.text.length)],
    lang: "en"
  } as Tweet
}

export const generateRealisticTweetText = (seed: number): string => {
  const templates = [
    "Just had an amazing coffee at the local cafe ☕",
    "Working on some exciting new features today! #coding #typescript",
    "Beautiful sunset this evening 🌅 Nature never ceases to amaze",
    "Reading an interesting article about machine learning and AI",
    "Can't wait for the weekend! Any plans? 🎉",
    "Just finished a great workout! Feeling energized 💪",
    "Loving the new update to my favorite app",
    "Great meeting today with the team. Exciting things ahead!",
    "Anyone else excited about the upcoming conference?",
    "Just discovered this amazing restaurant downtown 🍕",
    "Working from a coffee shop today. Change of scenery helps creativity",
    "Debugging code is like detective work 🕵️‍♂️",
    "Happy Friday everyone! What are your weekend plans?",
    "Just watched an incredible documentary. Highly recommend!",
    "The weather today is perfect for a walk in the park 🌳",
    "Learning something new every day keeps life interesting",
    "Coffee count for today: 3 ☕☕☕ Is that too much?",
    "Sometimes the simplest solution is the best solution",
    "Grateful for all the amazing people in my life ❤️",
    "New blog post is up! Check it out and let me know what you think"
  ]
  
  // Add some variation with seed
  const index = seed % templates.length
  const variation = seed % 10
  
  if (variation < 3) {
    // Add some mentions occasionally
    return `@user_${seed % 100} ${templates[index]}`
  } else if (variation < 5) {
    // Add some hashtags
    return `${templates[index]} #tech #life`
  }
  
  return templates[index]
}

export const generateMentions = (count: number, seedOffset: number = 0) => {
  return Array.from({ length: count }, (_, i) => ({
    id_str: String(100000 + seedOffset + i),
    id: String(100000 + seedOffset + i),
    screen_name: `user_${seedOffset + i}`,
    name: `User ${String.fromCharCode(65 + (seedOffset + i) % 26)}`,
    indices: [String(i * 10), String(i * 10 + 8)]
  }))
}

export const generateUrls = (count: number, seedOffset: number = 0) => {
  const domains = ['example.com', 'test.org', 'demo.net', 'sample.io', 'mock.dev']
  
  return Array.from({ length: count }, (_, i) => ({
    url: `https://t.co/${String.fromCharCode(97 + i)}${seedOffset}`,
    expanded_url: `https://${domains[(seedOffset + i) % domains.length]}/page${seedOffset + i}`,
    display_url: `${domains[(seedOffset + i) % domains.length]}/page${seedOffset + i}`,
    indices: [String(i * 20), String(i * 20 + 15)]
  }))
}

export const generateMedia = (count: number, seedOffset: number = 0) => {
  const types = ['photo', 'video', 'animated_gif']
  const typeWeights = [0.8, 0.15, 0.05] // 80% photos, 15% videos, 5% gifs
  
  return Array.from({ length: count }, (_, i) => {
    const random = Math.random()
    let type = types[0]
    if (random > typeWeights[0]) {
      type = random > typeWeights[0] + typeWeights[1] ? types[2] : types[1]
    }
    
    const extension = type === 'photo' ? 'jpg' : type === 'video' ? 'mp4' : 'gif'
    
    return {
      id_str: `${1000000 + seedOffset + i}`,
      id: `${1000000 + seedOffset + i}`,
      media_url: `http://pbs.twimg.com/media/test_${seedOffset + i}.${extension}`,
      media_url_https: `https://pbs.twimg.com/media/test_${seedOffset + i}.${extension}`,
      type: type,
      sizes: {
        thumb: { w: 150, h: 150, resize: "crop" },
        small: { w: 680, h: 383, resize: "fit" },
        medium: { w: 1200, h: 675, resize: "fit" },
        large: {
          w: 1920 + Math.floor(Math.random() * 500),
          h: 1080 + Math.floor(Math.random() * 500),
          resize: "fit"
        }
      },
      indices: ["50", "73"]
    }
  })
}

export const generateHashtags = (count: number, seedOffset: number = 0) => {
  const hashtags = [
    'tech', 'coding', 'javascript', 'typescript', 'react', 
    'nodejs', 'webdev', 'programming', 'software', 'engineering',
    'AI', 'MachineLearning', 'DataScience', 'Cloud', 'DevOps',
    'startup', 'innovation', 'product', 'design', 'ux'
  ]
  
  return Array.from({ length: count }, (_, i) => ({
    text: hashtags[(seedOffset + i) % hashtags.length],
    indices: [String(i * 15), String(i * 15 + 10)]
  }))
}

export const generateDateInRange = (startYear: number, endYear: number): string => {
  const start = new Date(startYear, 0, 1)
  const end = new Date(endYear, 11, 31)
  const randomTime = start.getTime() + Math.random() * (end.getTime() - start.getTime())
  return new Date(randomTime).toISOString().replace(/\.\d{3}Z$/, '+0000').replace('T', ' ')
}

export const generateLongText = (length: number): string => {
  const words = [
    'amazing', 'wonderful', 'incredible', 'fantastic', 'excellent',
    'project', 'development', 'implementation', 'solution', 'approach',
    'creative', 'innovative', 'groundbreaking', 'revolutionary', 'transformative',
    'technology', 'platform', 'framework', 'architecture', 'infrastructure',
    'collaboration', 'teamwork', 'partnership', 'community', 'ecosystem',
    'performance', 'efficiency', 'scalability', 'reliability', 'security'
  ]
  
  let text = ''
  while (text.length < length) {
    const word = words[Math.floor(Math.random() * words.length)]
    text += word + ' '
  }
  
  return text.trim().substring(0, length)
}

export const createNoteTweet = (
  id: string, 
  text: string, 
  createdAt: string
): NoteTweet => {
  return {
    noteTweetId: id,
    createdAt: createdAt,
    updatedAt: createdAt,
    lifecycle: {
      value: "self_threads_v1",
      name: "SelfThreadsV1",
      originalName: "SelfThreadsV1",
      annotations: {}
    },
    core: {
      text: text,
      mentions: [],
      urls: [],
      hashtags: [],
      cashtags: [],
      styletags: []
    }
  }
}

export const generateProblematicText = (): string => {
  return "Text with null\x00byte and control\x01\x02chars and emoji🎉 and unicode: 你好 مرحبا שלום 🏳️‍🌈"
}

export const generateFollower = (accountId: string): Follower => {
  return {
    accountId: accountId,
    userLink: `https://twitter.com/intent/user?user_id=${accountId}`
  }
}

export const generateFollowing = (accountId: string): Following => {
  return {
    accountId: accountId,
    userLink: `https://twitter.com/intent/user?user_id=${accountId}`
  }
}

export const generateLike = (tweetId: string, fullText: string): Like => {
  return {
    tweetId: tweetId,
    fullText: fullText
  }
}