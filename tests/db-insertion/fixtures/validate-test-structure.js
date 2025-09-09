/**
 * Validate Test Structure
 * 
 * This script validates that all test files and mock data are correctly set up
 * without requiring database access.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Test Structure...\n');

// Check for required files
const requiredFiles = [
  'mock-data-builders.ts',
  'generate-mock-archives.ts',
  'test-db-utils-direct.ts',
  'generated/small-exhaustive.json',
  'generated/large-benchmark.json',
  '../db-insertion-direct.test.ts'
];

let allFilesExist = true;
const baseDir = __dirname;

console.log('📁 Checking required files:');
for (const file of requiredFiles) {
  const filePath = path.join(baseDir, file);
  const exists = fs.existsSync(filePath);
  
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
  
  if (exists && file.endsWith('.json')) {
    try {
      const stats = fs.statSync(filePath);
      console.log(`      Size: ${(stats.size / 1024).toFixed(2)} KB`);
    } catch (err) {
      console.log(`      ⚠️ Could not read file stats`);
    }
  }
  
  if (!exists) {
    allFilesExist = false;
  }
}

console.log('\n📊 Validating mock data structure:');

// Validate small archive structure
try {
  const smallArchive = JSON.parse(
    fs.readFileSync(path.join(baseDir, 'generated/small-exhaustive.json'), 'utf8')
  );
  
  const expectedKeys = ['account', 'profile', 'tweets', 'note-tweet', 'like', 'follower', 'following'];
  const hasAllKeys = expectedKeys.every(key => key in smallArchive);
  
  console.log(`   ${hasAllKeys ? '✅' : '❌'} Small archive has all expected keys`);
  
  if (smallArchive.tweets) {
    console.log(`   📝 Small archive contains ${smallArchive.tweets.length} tweets`);
    
    // Check for specific test cases
    const testCases = [
      { id: '1001', desc: 'Basic tweet' },
      { id: '1002', desc: 'Tweet with reply' },
      { id: '1003', desc: 'Tweet with entities' },
      { id: '1004', desc: 'Tweet with media' },
      { id: '1005', desc: 'Tweet for note patching' },
      { id: '1006', desc: 'Tweet with problematic chars' },
      { id: '999999999999999999', desc: 'Tweet with large ID' }
    ];
    
    console.log('\n   📋 Test cases coverage:');
    for (const testCase of testCases) {
      const found = smallArchive.tweets.some(t => t.tweet.id_str === testCase.id);
      console.log(`      ${found ? '✅' : '❌'} ${testCase.desc} (ID: ${testCase.id})`);
    }
  }
  
  // Check note tweets
  if (smallArchive['note-tweet']) {
    console.log(`\n   📄 Note tweets: ${smallArchive['note-tweet'].length}`);
    const hasMatchingNote = smallArchive['note-tweet'].some(nt => 
      nt.noteTweet.noteTweetId === 'nt1005'
    );
    console.log(`      ${hasMatchingNote ? '✅' : '❌'} Has matching note tweet for patching`);
    
    const hasOrphanNote = smallArchive['note-tweet'].some(nt => 
      nt.noteTweet.noteTweetId.startsWith('nt999')
    );
    console.log(`      ${hasOrphanNote ? '✅' : '❌'} Has orphan note tweet`);
  }
  
  // Check likes for duplicates
  if (smallArchive.like) {
    const likeTweetIds = smallArchive.like.map(l => l.like.tweetId);
    const uniqueLikeTweetIds = [...new Set(likeTweetIds)];
    const hasDuplicates = likeTweetIds.length > uniqueLikeTweetIds.length;
    
    console.log(`\n   👍 Likes: ${smallArchive.like.length}`);
    console.log(`      ${hasDuplicates ? '✅' : '❌'} Contains duplicate likes for deduplication testing`);
  }
  
} catch (err) {
  console.log('   ❌ Failed to validate small archive:', err.message);
}

// Validate large archive exists and basic structure
try {
  const largePath = path.join(baseDir, 'generated/large-benchmark.json');
  const stats = fs.statSync(largePath);
  
  console.log(`\n📦 Large benchmark archive:`);
  console.log(`   Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
  
  // Read just the first part to validate structure without loading entire file
  const fd = fs.openSync(largePath, 'r');
  const buffer = Buffer.alloc(1000);
  fs.readSync(fd, buffer, 0, 1000, 0);
  fs.closeSync(fd);
  
  const snippet = buffer.toString('utf8');
  const hasExpectedStructure = snippet.includes('"account"') && snippet.includes('"profile"');
  
  console.log(`   ${hasExpectedStructure ? '✅' : '❌'} Has expected JSON structure`);
  
} catch (err) {
  console.log('   ❌ Failed to validate large archive:', err.message);
}

// Check test files
console.log('\n🧪 Test files:');

const testFiles = [
  '../db-insertion-direct.test.ts',
  '../db-insertion.test.ts'
];

for (const testFile of testFiles) {
  const testPath = path.join(baseDir, testFile);
  if (fs.existsSync(testPath)) {
    const content = fs.readFileSync(testPath, 'utf8');
    const testCount = (content.match(/\bit\(/g) || []).length;
    const describeCount = (content.match(/\bdescribe\(/g) || []).length;
    
    console.log(`   ✅ ${path.basename(testFile)}`);
    console.log(`      ${describeCount} test suites, ${testCount} tests`);
  } else {
    console.log(`   ❌ ${path.basename(testFile)} not found`);
  }
}

// Summary
console.log('\n' + '='.repeat(50));
if (allFilesExist) {
  console.log('✅ All test files and mock data are properly set up!');
  console.log('\nNext steps:');
  console.log('1. Set SUPABASE_SERVICE_ROLE in .env.local');
  console.log('2. Run: pnpm test:db');
} else {
  console.log('❌ Some files are missing. Please check the setup.');
}
console.log('='.repeat(50));