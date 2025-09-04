import { Archive } from '@/lib/types'
import * as fs from 'fs/promises'
import * as path from 'path'
import {
  createTweet,
  generateRealisticTweetText,
  generateMentions,
  generateUrls,
  generateMedia,
  generateHashtags,
  generateDateInRange,
  generateLongText,
  createNoteTweet,
  generateProblematicText,
  generateFollower,
  generateFollowing,
  generateLike
} from './mock-data-builders'

export const generateSmallExhaustiveMockArchive = (): Archive => {
  const accountId = "123456789"
  const username = "test_user"
  
  const tweets = [
    // 1. Basic tweet with minimal fields
    createTweet({
      id: "1001",
      text: "Simple tweet with just text",
      created_at: "2023-01-01 12:00:00 +0000"
    }),
    
    // 2. Tweet with reply fields
    createTweet({
      id: "1002", 
      text: "@other_user This is a reply to your tweet",
      created_at: "2023-01-02 13:30:00 +0000",
      reply_to_tweet_id: "999",
      reply_to_user_id: "987654321",
      reply_to_username: "other_user"
    }),
    
    // 3. Tweet with all entity types
    createTweet({
      id: "1003",
      text: "Check out @user1 and @user2 at https://t.co/abc #hashtag #tech $STOCK",
      created_at: "2023-01-03 14:15:00 +0000",
      entities: {
        user_mentions: [
          { id_str: "111", id: "111", screen_name: "user1", name: "User One", indices: ["10", "16"] },
          { id_str: "222", id: "222", screen_name: "user2", name: "User Two", indices: ["21", "27"] }
        ],
        urls: [
          { 
            url: "https://t.co/abc", 
            expanded_url: "https://example.com/article", 
            display_url: "example.com/article",
            indices: ["31", "46"]
          }
        ],
        hashtags: [
          { text: "hashtag", indices: ["47", "55"] },
          { text: "tech", indices: ["56", "61"] }
        ],
        symbols: [
          { text: "STOCK", indices: ["62", "68"] }
        ],
        media: []
      }
    }),
    
    // 4. Tweet with multiple media items
    createTweet({
      id: "1004",
      text: "Check out these photos from today! https://t.co/media1",
      created_at: "2023-01-04 09:45:00 +0000",
      entities: {
        hashtags: [],
        symbols: [],
        user_mentions: [],
        urls: [
          {
            url: "https://t.co/media1",
            expanded_url: "https://twitter.com/test_user/status/1004/photo/1",
            display_url: "pic.twitter.com/media1",
            indices: ["36", "51"]
          }
        ],
        media: [
          {
            id_str: "m1001",
            id: "m1001",
            media_url: "http://pbs.twimg.com/media/test1.jpg",
            media_url_https: "https://pbs.twimg.com/media/test1.jpg",
            type: "photo",
            sizes: {
              thumb: { w: 150, h: 150, resize: "crop" },
              small: { w: 680, h: 510, resize: "fit" },
              medium: { w: 1200, h: 900, resize: "fit" },
              large: { w: 1920, h: 1080, resize: "fit" }
            },
            indices: ["36", "51"]
          },
          {
            id_str: "m1002",
            id: "m1002",
            media_url: "http://pbs.twimg.com/media/test2.mp4",
            media_url_https: "https://pbs.twimg.com/media/test2.mp4",
            type: "video",
            sizes: {
              thumb: { w: 150, h: 150, resize: "crop" },
              small: { w: 640, h: 360, resize: "fit" },
              medium: { w: 1280, h: 720, resize: "fit" },
              large: { w: 1280, h: 720, resize: "fit" }
            },
            indices: ["36", "51"]
          }
        ]
      },
      favorite_count: 42,
      retweet_count: 7
    }),
    
    // 5. Tweet that will be patched by note-tweet (truncated)
    createTweet({
      id: "1005",
      text: "This is a truncated tweet that will be expanded by note-tweet functionality. The full text is much longer than what you see here and contains additional important information that couldn't fit in the regular tweet character limit...",
      created_at: "2023-01-05 15:30:00 +0000"
    }),
    
    // 6. Tweet with problematic characters that need sanitization
    createTweet({
      id: "1006",
      text: generateProblematicText(),
      created_at: "2023-01-06 16:00:00 +0000"
    }),
    
    // 7. Tweet with maximum/edge case values
    createTweet({
      id: "999999999999999999", // Very large ID
      text: "Tweet with very large ID and engagement numbers",
      created_at: "2023-01-07 17:30:00 +0000",
      favorite_count: 1000000,
      retweet_count: 500000
    }),
    
    // 8. Tweet with empty/minimal entities
    createTweet({
      id: "1008",
      text: "Minimal tweet with empty entities",
      created_at: "2023-01-08 18:00:00 +0000",
      entities: {
        hashtags: [],
        symbols: [],
        user_mentions: [],
        urls: [],
        media: []
      }
    }),
    
    // 9. Tweet with multiple URLs and missing display_url
    createTweet({
      id: "1009",
      text: "Multiple links: https://t.co/link1 and https://t.co/link2 check them out!",
      created_at: "2023-01-09 10:00:00 +0000",
      entities: {
        hashtags: [],
        symbols: [],
        user_mentions: [],
        urls: [
          { 
            url: "https://t.co/link1",
            expanded_url: "https://site1.com/page",
            display_url: "site1.com/page",
            indices: ["16", "35"]
          },
          { 
            url: "https://t.co/link2",
            expanded_url: "https://site2.com/article",
            display_url: "", // Empty display URL
            indices: ["40", "59"]
          }
        ],
        media: []
      }
    }),
    
    // 10. Tweet with various Unicode characters and emojis
    createTweet({
      id: "1010",
      text: "Unicode test: 你好 مرحبا שלום 🏳️‍🌈 𝕳𝖊𝖑𝖑𝖔 ñáéíóú ÀÈÌÒÙ",
      created_at: "2023-01-10 11:30:00 +0000"
    }),
    
    // 11. Tweet with very long text (edge case for text length)
    createTweet({
      id: "1011",
      text: "A".repeat(280), // Maximum tweet length
      created_at: "2023-01-11 12:00:00 +0000"
    }),
    
    // 12. Tweet with media but no URL entity (edge case)
    createTweet({
      id: "1012",
      text: "Photo without URL entity",
      created_at: "2023-01-12 13:00:00 +0000",
      entities: {
        hashtags: [],
        symbols: [],
        user_mentions: [],
        urls: [],
        media: [
          {
            id_str: "m1003",
            id: "m1003",
            media_url: "http://pbs.twimg.com/media/orphan.jpg",
            media_url_https: "https://pbs.twimg.com/media/orphan.jpg",
            type: "photo",
            sizes: {
              large: { w: 1024, h: 768, resize: "fit" }
            },
            indices: ["25", "40"]
          }
        ]
      }
    }),
    
    // 13. Tweet with duplicate user mentions (same user mentioned twice)
    createTweet({
      id: "1013",
      text: "Hey @duplicate and @duplicate check this out!",
      created_at: "2023-01-13 14:00:00 +0000",
      entities: {
        hashtags: [],
        symbols: [],
        user_mentions: [
          { id_str: "333", id: "333", screen_name: "duplicate", name: "Duplicate User", indices: ["4", "14"] },
          { id_str: "333", id: "333", screen_name: "duplicate", name: "Duplicate User", indices: ["19", "29"] }
        ],
        urls: [],
        media: []
      }
    }),
    
    // 14. Tweet with special characters in reply username
    createTweet({
      id: "1014",
      text: "@user_with-special.chars This is a reply",
      created_at: "2023-01-14 15:00:00 +0000",
      reply_to_tweet_id: "888",
      reply_to_user_id: "444",
      reply_to_username: "user_with-special.chars"
    }),
    
    // 15. Tweet with zero engagement metrics
    createTweet({
      id: "1015",
      text: "Tweet with zero likes and retweets",
      created_at: "2023-01-15 16:00:00 +0000",
      favorite_count: 0,
      retweet_count: 0
    })
  ]
  
  // Note tweets - including one that matches tweet 1005 and one orphan
  const noteTweets = [
    // Matching note tweet for tweet 1005
    createNoteTweet(
      "nt1005",
      "This is a truncated tweet that will be expanded by note-tweet functionality. The full text is much longer than what you see here and contains additional important information that couldn't fit in the regular tweet character limit. This extended version includes all the details about the topic being discussed, with proper context and explanations that help readers understand the complete message. Note tweets are essential for sharing longer-form content on Twitter while maintaining the platform's characteristic brevity in the main timeline.",
      new Date(new Date("2023-01-05 15:30:00 +0000").getTime() + 500).toISOString() // Within 1 second
    ),
    
    // Orphan note tweet (no matching regular tweet)
    createNoteTweet(
      "nt9999",
      "This is an orphan note tweet with no corresponding regular tweet. It exists independently and should be handled gracefully by the system. This tests the edge case where note tweet data exists but cannot be matched to any regular tweet based on the matching criteria of text substring and timestamp proximity.",
      "2023-12-31 23:59:59 +0000"
    ),
    
    // Another orphan with special characters
    createNoteTweet(
      "nt9998",
      generateProblematicText() + " Extended version with more problematic characters and emojis 🎉🎊🎈",
      "2023-12-30 22:00:00 +0000"
    )
  ]
  
  // Likes with various edge cases
  const likes = [
    generateLike("2001", "Normal liked tweet with full text content"),
    generateLike("2002", ""), // Empty fullText
    generateLike("2003", "Another liked tweet"),
    generateLike("2003", "Duplicate like for same tweet ID"), // Duplicate should be filtered
    generateLike("2004", generateProblematicText()), // Problematic characters
    generateLike("2005", "A".repeat(500)), // Very long text
    generateLike("2006", "Tweet with\nnewlines\nand\ttabs"),
    generateLike("999999999999999999", "Like with very large tweet ID")
  ]
  
  // Followers including self-follow edge case
  const followers = [
    generateFollower("201"),
    generateFollower("202"),
    generateFollower("203"),
    generateFollower("204"),
    generateFollower("205"),
    generateFollower(accountId), // Self-follow edge case
    generateFollower("999999999999") // Large ID
  ]
  
  // Following including self-follow
  const following = [
    generateFollowing("301"),
    generateFollowing("302"),
    generateFollowing("303"),
    generateFollowing(accountId), // Self-follow edge case
    generateFollowing("999999999999") // Large ID
  ]
  
  // Community tweets
  const communityTweets = [
    {
      id: "3001",
      id_str: "3001",
      created_at: "2023-02-01 10:00:00 +0000",
      full_text: "Community tweet example with normal content",
      community_id: "123456",
      community_id_str: "123456",
      entities: {
        hashtags: [],
        symbols: [],
        user_mentions: [],
        urls: [],
        media: []
      },
      favorite_count: "5",
      retweet_count: "2",
      favorited: false,
      retweeted: false,
      truncated: false,
      source: '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>',
      scopes: { followers: false },
      lang: "en",
      display_text_range: ["0", "44"]
    },
    {
      id: "3002",
      id_str: "3002",
      created_at: "2023-02-02 11:00:00 +0000",
      full_text: "Community tweet with @mention and #hashtag",
      community_id: "123456",
      community_id_str: "123456",
      entities: {
        hashtags: [{ text: "hashtag", indices: ["35", "43"] }],
        symbols: [],
        user_mentions: [
          { id_str: "555", id: "555", screen_name: "mention", name: "Mentioned User", indices: ["21", "29"] }
        ],
        urls: [],
        media: []
      },
      favorite_count: "10",
      retweet_count: "3",
      favorited: true,
      retweeted: false,
      truncated: false,
      source: '<a href="http://twitter.com/download/android" rel="nofollow">Twitter for Android</a>',
      scopes: { followers: false },
      lang: "en",
      display_text_range: ["0", "43"]
    }
  ]
  
  return {
    account: [{
      account: {
        accountId,
        username,
        createdVia: "web",
        createdAt: "2010-01-15T10:30:00.000Z",
        accountDisplayName: "Test User 🧪"
      }
    }],
    
    profile: [{
      profile: {
        description: {
          bio: "Bio with émojis 🎉 and special\nchars: @#$%^&*() and newlines",
          website: "https://example.com/profile?user=test",
          location: "San Francisco, CA 🌁"
        },
        avatarMediaUrl: "https://pbs.twimg.com/profile_images/123456789/avatar.jpg",
        headerMediaUrl: "https://pbs.twimg.com/profile_banners/123456789/header.jpg"
      }
    }],
    
    tweets: tweets.map(tweet => ({ tweet })),
    
    'note-tweet': noteTweets.map(noteTweet => ({ noteTweet })),
    
    like: likes.map(like => ({ like })),
    
    follower: followers.map(follower => ({ follower })),
    
    following: following.map(following => ({ following })),
    
    'community-tweet': communityTweets.map(tweet => ({ tweet })),
    
    'upload-options': {
      keepPrivate: false,
      uploadLikes: true,
      startDate: new Date("2023-01-01"),
      endDate: new Date("2023-12-31")
    }
  }
}

export const generateLargeBenchmarkArchive = (config = {
  tweetCount: 50000,
  likeCount: 25000,
  followerCount: 5000,
  followingCount: 2000,
  noteTweetPercentage: 0.05 // 5% of tweets have note tweets
}): Archive => {
  const accountId = "987654321"
  const username = "benchmark_user"
  
  console.log(`Generating ${config.tweetCount} tweets...`)
  
  // Generate tweets with realistic distribution
  const tweets = Array.from({ length: config.tweetCount }, (_, i) => {
    const hasReply = Math.random() < 0.3 // 30% are replies
    const hasMentions = Math.random() < 0.2 // 20% have mentions
    const hasMedia = Math.random() < 0.15 // 15% have media
    const hasUrls = Math.random() < 0.25 // 25% have URLs
    const hasHashtags = Math.random() < 0.4 // 40% have hashtags
    
    const tweetId = String(1000000 + i)
    const entities: any = {
      hashtags: [],
      symbols: [],
      user_mentions: [],
      urls: [],
      media: []
    }
    
    if (hasMentions) {
      entities.user_mentions = generateMentions(1 + Math.floor(Math.random() * 3), i)
    }
    
    if (hasMedia) {
      entities.media = generateMedia(1 + Math.floor(Math.random() * 4), i)
      // Media tweets usually have a URL to the media
      entities.urls = [{
        url: `https://t.co/media${i}`,
        expanded_url: `https://twitter.com/${username}/status/${tweetId}/photo/1`,
        display_url: `pic.twitter.com/media${i}`,
        indices: ["100", "123"]
      }]
    } else if (hasUrls) {
      entities.urls = generateUrls(1 + Math.floor(Math.random() * 3), i)
    }
    
    if (hasHashtags) {
      entities.hashtags = generateHashtags(1 + Math.floor(Math.random() * 5), i)
    }
    
    // Add some symbols occasionally
    if (Math.random() < 0.05) {
      entities.symbols = [
        { text: "TSLA", indices: ["50", "55"] },
        { text: "AAPL", indices: ["56", "61"] }
      ]
    }
    
    return createTweet({
      id: tweetId,
      text: generateRealisticTweetText(i),
      created_at: generateDateInRange(2020, 2024),
      favorite_count: Math.floor(Math.random() * Math.random() * 1000), // Exponential distribution
      retweet_count: Math.floor(Math.random() * Math.random() * 500),
      ...(hasReply && {
        reply_to_tweet_id: String(900000 + Math.floor(Math.random() * 100000)),
        reply_to_user_id: String(Math.floor(Math.random() * 1000000)),
        reply_to_username: `user_${Math.floor(Math.random() * 1000)}`
      }),
      entities
    })
  })
  
  console.log(`Generating ${config.likeCount} likes...`)
  
  // Generate likes with some intentional duplicates to test deduplication
  const likes = Array.from({ length: config.likeCount }, (_, i) => {
    // Create 10% duplicates by using same ID for nearby likes
    const tweetIdBase = 2000000 + Math.floor(i * 0.9)
    return generateLike(
      String(tweetIdBase),
      i % 100 === 0 ? "" : `Liked tweet ${i}: ${generateRealisticTweetText(i)}`
    )
  })
  
  console.log(`Generating ${config.followerCount} followers...`)
  
  // Generate followers
  const followers = Array.from({ length: config.followerCount }, (_, i) => 
    generateFollower(String(400000 + i))
  )
  
  console.log(`Generating ${config.followingCount} following...`)
  
  // Generate following
  const following = Array.from({ length: config.followingCount }, (_, i) => 
    generateFollowing(String(500000 + i))
  )
  
  console.log(`Generating note tweets for ${Math.floor(tweets.length * config.noteTweetPercentage)} tweets...`)
  
  // Generate note tweets for a percentage of tweets
  const noteTweetIndices = new Set<number>()
  const targetNoteTweetCount = Math.floor(tweets.length * config.noteTweetPercentage)
  while (noteTweetIndices.size < targetNoteTweetCount) {
    noteTweetIndices.add(Math.floor(Math.random() * tweets.length))
  }
  
  const noteTweets = Array.from(noteTweetIndices).map(index => {
    const tweet = tweets[index]
    // Create matching note tweet (within timestamp range)
    const originalTime = new Date(tweet.created_at.replace(' +0000', 'Z')).getTime()
    const noteTime = new Date(originalTime + Math.random() * 900).toISOString() // Within 900ms
    
    return createNoteTweet(
      `nt${tweet.id_str}`,
      tweet.full_text.substring(0, 200) + " " + generateLongText(300 + Math.floor(Math.random() * 700)),
      noteTime
    )
  })
  
  // Add some orphan note tweets
  const orphanNoteTweets = Array.from({ length: 100 }, (_, i) => 
    createNoteTweet(
      `nt_orphan_${i}`,
      "Orphan note tweet " + generateLongText(200 + Math.floor(Math.random() * 300)),
      generateDateInRange(2020, 2024)
    )
  )
  
  console.log('Archive generation complete!')
  
  return {
    account: [{
      account: {
        accountId,
        username,
        createdVia: "web",
        createdAt: "2009-03-21T15:30:00.000Z",
        accountDisplayName: "Benchmark User 📊"
      }
    }],
    
    profile: [{
      profile: {
        description: {
          bio: "Test account for benchmarking database insertion performance. Contains large amounts of test data.",
          website: "https://benchmark.example.com",
          location: "Performance Testing Lab"
        },
        avatarMediaUrl: "https://pbs.twimg.com/profile_images/987654321/benchmark.jpg",
        headerMediaUrl: "https://pbs.twimg.com/profile_banners/987654321/benchmark_header.jpg"
      }
    }],
    
    tweets: tweets.map(tweet => ({ tweet })),
    
    'note-tweet': [...noteTweets, ...orphanNoteTweets].map(noteTweet => ({ noteTweet })),
    
    like: likes.map(like => ({ like })),
    
    follower: followers.map(follower => ({ follower })),
    
    following: following.map(following => ({ following })),
    
    'community-tweet': [], // Empty for benchmark
    
    'upload-options': {
      keepPrivate: false,
      uploadLikes: true,
      startDate: new Date("2020-01-01"),
      endDate: new Date("2024-12-31")
    }
  }
}

// Main function to generate both archives
async function main() {
  const outputDir = path.join(__dirname, 'generated')
  
  try {
    await fs.mkdir(outputDir, { recursive: true })
    console.log(`Created output directory: ${outputDir}`)
  } catch (error) {
    console.error('Error creating directory:', error)
  }
  
  console.log('\n=== Generating Small Exhaustive Mock Archive ===')
  const smallArchive = generateSmallExhaustiveMockArchive()
  
  const smallPath = path.join(outputDir, 'small-exhaustive.json')
  await fs.writeFile(
    smallPath,
    JSON.stringify(smallArchive, null, 2)
  )
  console.log(`✅ Small archive saved to: ${smallPath}`)
  
  // Print small archive statistics
  console.log('\nSmall Archive Statistics:')
  console.log(`  - Account: ${smallArchive.account[0].account.username}`)
  console.log(`  - Tweets: ${smallArchive.tweets.length}`)
  console.log(`  - Note tweets: ${smallArchive['note-tweet']?.length || 0}`)
  console.log(`  - Likes: ${smallArchive.like.length}`)
  console.log(`  - Followers: ${smallArchive.follower.length}`)
  console.log(`  - Following: ${smallArchive.following.length}`)
  console.log(`  - Community tweets: ${smallArchive['community-tweet'].length}`)
  
  console.log('\n=== Generating Large Benchmark Archive ===')
  const largeArchive = generateLargeBenchmarkArchive()
  
  const largePath = path.join(outputDir, 'large-benchmark.json')
  await fs.writeFile(
    largePath,
    JSON.stringify(largeArchive, null, 2)
  )
  console.log(`✅ Large archive saved to: ${largePath}`)
  
  // Print large archive statistics
  console.log('\nLarge Archive Statistics:')
  console.log(`  - Account: ${largeArchive.account[0].account.username}`)
  console.log(`  - Tweets: ${largeArchive.tweets.length}`)
  console.log(`  - Note tweets: ${largeArchive['note-tweet']?.length || 0}`)
  console.log(`  - Likes: ${largeArchive.like.length}`)
  console.log(`  - Followers: ${largeArchive.follower.length}`)
  console.log(`  - Following: ${largeArchive.following.length}`)
  
  // Calculate file sizes
  const smallStats = await fs.stat(smallPath)
  const largeStats = await fs.stat(largePath)
  
  console.log('\nFile Sizes:')
  console.log(`  - Small archive: ${(smallStats.size / 1024).toFixed(2)} KB`)
  console.log(`  - Large archive: ${(largeStats.size / (1024 * 1024)).toFixed(2)} MB`)
  
  console.log('\n✨ Mock archive generation complete!')
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error)
}

// Export for use in tests
export {
  generateSmallExhaustiveMockArchive,
  generateLargeBenchmarkArchive
}

export default {
  generateSmallExhaustiveMockArchive,
  generateLargeBenchmarkArchive
}