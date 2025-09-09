// Simple JavaScript version for testing without TypeScript
const fs = require('fs').promises;
const path = require('path');

// Simplified version to test the generation
async function generateAndSave() {
  const outputDir = path.join(__dirname, 'generated');
  
  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  } catch (error) {
    console.error('Error creating directory:', error);
  }
  
  // Create a simple test archive
  const smallArchive = {
    account: [{
      account: {
        accountId: "123456789",
        username: "test_user",
        createdVia: "web",
        createdAt: "2010-01-15T10:30:00.000Z",
        accountDisplayName: "Test User 🧪"
      }
    }],
    profile: [{
      profile: {
        description: {
          bio: "Test bio with emojis 🎉",
          website: "https://example.com",
          location: "San Francisco, CA"
        },
        avatarMediaUrl: "https://pbs.twimg.com/profile_images/test.jpg",
        headerMediaUrl: "https://pbs.twimg.com/profile_banners/test.jpg"
      }
    }],
    tweets: [
      {
        tweet: {
          id: "1001",
          id_str: "1001",
          created_at: "2023-01-01 12:00:00 +0000",
          full_text: "Simple test tweet",
          entities: { hashtags: [], symbols: [], user_mentions: [], urls: [] },
          favorite_count: "10",
          retweet_count: "5",
          favorited: false,
          retweeted: false,
          truncated: false,
          source: '<a href="https://mobile.twitter.com">Twitter Web App</a>'
        }
      }
    ],
    'note-tweet': [],
    like: [
      { like: { tweetId: "2001", fullText: "Test liked tweet" } }
    ],
    follower: [
      { follower: { accountId: "201", userLink: "https://twitter.com/intent/user?user_id=201" } }
    ],
    following: [
      { following: { accountId: "301", userLink: "https://twitter.com/intent/user?user_id=301" } }
    ],
    'community-tweet': [],
    'upload-options': {
      keepPrivate: false,
      uploadLikes: true,
      startDate: new Date("2023-01-01"),
      endDate: new Date("2023-12-31")
    }
  };
  
  const smallPath = path.join(outputDir, 'small-test.json');
  await fs.writeFile(
    smallPath,
    JSON.stringify(smallArchive, null, 2)
  );
  
  console.log(`✅ Test archive saved to: ${smallPath}`);
  console.log('\nArchive Statistics:');
  console.log(`  - Tweets: ${smallArchive.tweets.length}`);
  console.log(`  - Likes: ${smallArchive.like.length}`);
  console.log(`  - Followers: ${smallArchive.follower.length}`);
  console.log(`  - Following: ${smallArchive.following.length}`);
  
  console.log('\n✨ Mock archive generation complete!');
}

// Run the generator
generateAndSave().catch(console.error);