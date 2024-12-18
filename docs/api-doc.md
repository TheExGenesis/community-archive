# API doc

There are two ways to access the Community Archive's data: (1) Download a JSON file with an individual user's data from blob storage (2) query the DB through the Supabase API

### Raw user data from blob storage

Given a username (lowercase), the URL format is: `/storage/v1/object/public/archives/<username>/archive.json`. 

For example, the URL for the user `DefenderOfBasic` is:

https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/archives/defenderofbasic/archive.json

The structure of this JSON is:

```js
{
  "account": {},// username, accountId, display name, etc..
  "follower": {}, // list of accountId's of followers
  "following": {}, // list of accountId's they follow
  "profile": {}, // bio & URL to profile picture
  "like": {}, // list of full text of each liked tweet
  "tweets": {}, // list of tweets
}
```

### Query the DB 

- API URL: `https://fabxmporizzqflnftavs.supabase.co`
- [API reference docs](https://open-birdsite-db.vercel.app/api/reference)
- Authorization token (gives you access to all GET routes): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8`

Curl example, fetch the profile info of 5 users:

```bash
export NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8

curl 'https://fabxmporizzqflnftavs.supabase.co/rest/v1/profile?limit=5' \
-H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
-H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

Supabase has [client libraries](https://github.com/supabase/supabase#client-libraries) for various languages. JavaScript example:

```js
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = 'https://fabxmporizzqflnftavs.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)
const { data, error } = await supabase
  .schema('public')
  .from('profile')
  .select('*')
  .limit(5)
console.log(data)
```

#### Get all tweets from a specific user

This example uses accountId for user `DefenderOfBasic`. 

With Curl:

```
curl 'https://fabxmporizzqflnftavs.supabase.co/rest/v1/tweets?account_id=eq.1680757426889342977&limit=1' \
-H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
-H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

With JavaScript:

```js
const { data, error } = await supabase
        .schema('public')
        .from('tweets')
        .select('*')
        .eq('account_id', '1680757426889342977') 
        .limit(1)
console.log(data)
```

You likely have their twitter handle, and not their accountId, so here is how you get a user's accountId from a twitter handle:
```js
const { data, error } = await supabase
    .from('account')
    .select('account_id')
    .eq('username', username)
    .single()
const accountId = data
console.log(accountId)
```

See [scripts/get_all_tweets_paginated.mts](scripts/get_all_tweets_paginated.mts) for an example of fetching all tweets with pagination. You can run it from the root directory with:

```
pnpm script scripts/get_all_tweets_paginated.mts
```
