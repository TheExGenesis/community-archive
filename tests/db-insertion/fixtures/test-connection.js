/**
 * Test Database Connection
 * 
 * Simple script to verify database connection and basic operations
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const PRODUCTION_SUPABASE_PROJECT_REF = 'fabxmporizzqflnftavs';

const isLocalHostname = (hostname) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const getSupabaseProjectRef = (url) => {
  const apiMatch = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (apiMatch) return apiMatch[1];

  const databaseMatch = url.hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i);
  if (databaseMatch) return databaseMatch[1];

  return decodeURIComponent(url.username).match(/^postgres\.([a-z0-9-]+)$/i)?.[1];
};

const assertSafeTestDatabaseConfig = (supabaseUrl, postgresConnectionString) => {
  if (
    supabaseUrl.includes(PRODUCTION_SUPABASE_PROJECT_REF) ||
    postgresConnectionString.includes(PRODUCTION_SUPABASE_PROJECT_REF)
  ) {
    throw new Error('Refusing to connect to the production Supabase project');
  }

  const apiUrl = new URL(supabaseUrl);
  const databaseUrl = new URL(postgresConnectionString);
  const apiIsLocal = isLocalHostname(apiUrl.hostname);
  const databaseIsLocal = isLocalHostname(databaseUrl.hostname);

  if (apiIsLocal !== databaseIsLocal) {
    throw new Error('The Supabase and Postgres test URLs target different databases');
  }

  if (!apiIsLocal) {
    const apiProjectRef = getSupabaseProjectRef(apiUrl);
    const databaseProjectRef = getSupabaseProjectRef(databaseUrl);

    if (!apiProjectRef || !databaseProjectRef || apiProjectRef !== databaseProjectRef) {
      throw new Error('Remote test URLs must identify the same non-production Supabase project');
    }
  }
};

async function testConnection() {
  console.log('🔍 Testing database connection...\n');
  
  const url = process.env.TESTS_SUPABASE_URL;
  const serviceRole = process.env.TESTS_SUPABASE_SERVICE_ROLE;
  const postgresConnectionString = process.env.TESTS_POSTGRES_CONNECTION_STRING;
  
  if (!url || !serviceRole || !postgresConnectionString) {
    console.error('❌ Missing required environment variables');
    console.log('TESTS_SUPABASE_URL:', url ? '✅' : '❌');
    console.log('TESTS_SUPABASE_SERVICE_ROLE:', serviceRole ? '✅' : '❌');
    console.log('TESTS_POSTGRES_CONNECTION_STRING:', postgresConnectionString ? '✅' : '❌');
    process.exitCode = 1;
    return;
  }

  assertSafeTestDatabaseConfig(url, postgresConnectionString);
  
  console.log('URL:', url);
  console.log('Service Role: configured');
  
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

testConnection().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
