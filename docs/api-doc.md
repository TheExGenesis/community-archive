# How to use the API (from your own app)

1. You can interact with the DB via `curl` or using any of [supabase's client libraries](https://github.com/supabase/supabase#client-libraries). See `NEXT_PUBLIC_SUPABASE_ANON_KEY` below, just copy paste it.

   ```
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8
   ```

   Curl example:

   ```bash
   curl 'https://fabxmporizzqflnftavs.supabase.co/rest/v1/profile?limit=5' \
   -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>" \
   -H "Authorization: Bearer <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
   ```

   Supabase javascript client (instructions [here](https://supabase.com/docs/reference/javascript/introduction)):

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

2. See [API schema here](https://open-birdsite-db.vercel.app/api/reference). Only `GET` requests are relevant, others you don't have permission for.
