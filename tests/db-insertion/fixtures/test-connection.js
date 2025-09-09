/**
 * Test Database Connection
 * 
 * Simple script to verify database connection and basic operations
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testConnection() {
  console.log('🔍 Testing database connection...\n');
  
  // Get configuration
  const useRemoteDb = process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true';
  console.log(`Using ${useRemoteDb ? 'REMOTE' : 'LOCAL'} database\n`);
  
  const url = useRemoteDb 
    ? process.env.NEXT_PUBLIC_SUPABASE_URL
    : process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL;
    
  const serviceRole = useRemoteDb
    ? process.env.SUPABASE_SERVICE_ROLE
    : process.env.NEXT_PUBLIC_LOCAL_SERVICE_ROLE;
  
  if (!url || !serviceRole) {
    console.error('❌ Missing required environment variables');
    console.log('URL:', url ? '✅' : '❌');
    console.log('Service Role:', serviceRole ? '✅' : '❌');
    return;
  }
  
  console.log('URL:', url);
  console.log('Service Role:', serviceRole.substring(0, 20) + '...');
  
  // Create client
  const supabase = createClient(url, serviceRole);
  
  // Test 1: Simple query
  console.log('\n📊 Test 1: Simple query');
  try {
    const { data, error } = await supabase
      .from('all_account')
      .select('account_id')
      .limit(1);
    
    if (error) {
      console.error('❌ Query failed:', error.message);
    } else {
      console.log('✅ Query successful');
      console.log('Found', data?.length || 0, 'accounts');
    }
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
  
  // Test 2: Test account creation
  const testAccountId = `test_connection_${Date.now()}`;
  console.log('\n📊 Test 2: Create test account');
  console.log('Account ID:', testAccountId);
  
  try {
    const { data, error } = await supabase
      .from('all_account')
      .upsert({
        account_id: testAccountId,
        username: 'test_connection',
        created_via: 'test',
        created_at: new Date().toISOString(),
        account_display_name: 'Test Connection',
        num_tweets: 0,
        num_following: 0,
        num_followers: 0,
        num_likes: 0
      })
      .select();
    
    if (error) {
      console.error('❌ Insert failed:', error.message);
      console.error('Details:', error);
    } else {
      console.log('✅ Insert successful');
    }
  } catch (err) {
    console.error('❌ Insert error:', err.message);
  }
  
  // Test 3: Clean up test account
  console.log('\n📊 Test 3: Clean up test account');
  try {
    const { error } = await supabase
      .from('all_account')
      .delete()
      .eq('account_id', testAccountId);
    
    if (error) {
      console.error('❌ Cleanup failed:', error.message);
    } else {
      console.log('✅ Cleanup successful');
    }
  } catch (err) {
    console.error('❌ Cleanup error:', err.message);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('Test connection script complete');
}

testConnection().catch(console.error);