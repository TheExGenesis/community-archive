# Context for LLMs about the Community Archive

The Community Archive is an open database and API for tweet histories. This document provides context for LLMs about how to work with the data effectively.

## API Doc

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

See [scripts/get_all_tweets_paginated.mts](../scripts/get_all_tweets_paginated.mts) for an example of fetching all tweets with pagination. You can run it from the root directory with:

```
pnpm script scripts/get_all_tweets_paginated.mts
```

# Development Instructions

1. Rename `.env.example` to `.env` and update the following:

```

NEXT_PUBLIC_SUPABASE_URL=https://fabxmporizzqflnftavs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8
NEXT_PUBLIC_USE_REMOTE_DEV_DB=false # Set to true to use the remote development database, false to use the local development database
NEXT_PUBLIC_LOCAL_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_LOCAL_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
NEXT_PUBLIC_LOCAL_SERVICE_ROLE=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
SUPABASE_SERVICE_ROLE=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
SUPABASE_AUTH_TWITTER_CLIENT_ID=<>
SUPABASE_AUTH_TWITTER_SECRET=<>
NEXT_PUBLIC_USER_ID=<>
NEXT_PUBLIC_USER_NAME=<>>
NODE_ENV=development

ARCHIVE_PATH=<path_to_archive_folder>


```

Both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` can be found in [your Supabase project's API settings](https://app.supabase.com/project/_/settings/api)

1. Install [node](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) and optionally [pnpm](https://pnpm.io/installation#using-npm)

2. Install dependencies

```bash
pnpm install

```

3. You can now run the Next.js local development server:

```**bash**
pnpm run dev
```

The app should now be running on [localhost:3000](http://localhost:3000/).

> Check out [the docs for Local Development](https://supabase.com/docs/guides/getting-started/local-development) to also run Supabase locally.

4. Run tests: `pnpm jest --selectProjects server --testPathPattern=src/lib -t "insertProfiles"`

   `--selectProjects server` will run tests only for the server-side code in node, and `--selectProjects client` will run tests only for the client-side code in jsdom (see `jest.config.js`)

5. If you make changes to the database schema, you'll want to update the types in `src/database-types.ts` with `pnpm gen-types`, you'll need a `SUPABASE_ACCESS_TOKEN` in your environment variables.

### Supabase local instance setup

Echoing [Supabase's Local Development instructions](https://supabase.com/docs/guides/cli/local-development?queryGroups=access-method&access-method=postgres#access-your-projects-services):

- `supabase login`
- Make sure docker is running:
  - There are a number of different projects available to download Docker from:
    - Docker Desktop (macOS, Windows, Linux)
    - Rancher Desktop (macOS, Windows, Linux)
    - OrbStack (macOS)
      colima (macOS)
- `supabase start`

You can now visit your local Dashboard at `http://localhost:54323`, and access the database directly with any Postgres client via `postgresql://postgres:postgres@localhost:54322/postgres.`

`supabase start` will give you the url, anon key, and service role key for your local db.

The local Postgres instance can be accessed through psql
or any other Postgres client, such as pgadmin.

For example:

`psql 'postgresql://postgres:postgres@localhost:54322/postgres'`

### Manage remote migrations

We can use Supabase's CLI to manage migrations locally, and then push them to the remote database. To do this fully you'll need a db password, so ask admins in the Discord.

Setup:

---

1. Associate your project with your remote project using `supabase link --project-ref fabxmporizzqflnftavs`
2. Pull the latest migrations from the remote database using `supabase migration pull` and if you want to manage auth and storage locally: `supabase db pull --schema auth,storage`,

For each change you make to the db:

3. Create your migration file: `supabase migration new create_employees_table`
4. Add the SQL to your migration file
5. Apply the new migration to your local database `supabase migration up` or `supabase db reset`
6. CAREFUL: Deploy any local database migrations directly to prod `supabase db push`

### Seeding the local database

- make sure your `.env` file has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` setup to the Community Archive db
- run the script `pnpm dev:downloadarchive`
- make sure your `.env` file has `*_LOCAL_*` env vars setup to your local db
- set the `ARCHIVE_PATH` environment variable to the path of the archive folder (which will be "../data/downloads/archives" from the root of the repo)
- run the script `pnpm dev:importfiles`
- wait a bit and then you should be able to see the data in the local supabase studio at http://localhost:54323/project/default/editor
- (OPTIONAL)run the script `pnpm dev:validateimport` to validate the data. afaict there's a few edge cases where the data might not import correctly. For now fixing this is not a priority, PR is welcome!

Note: this process takes a bit of time because there's 100+ archives to import. Feel free to delete some of the archives from the `ARCHIVE_PATH` folder if you want to speed up the process. Another option is finding the optimal `BATCH_SIZE` value in `scripts/importFromFilesToDb.ts` for your machine.

### Sign-in in dev mode

You might to test archive uploads in dev mode. Set these env variables to the user id and name of the user whose archive you want to upload.

```
NEXT_PUBLIC_USER_ID=<>
NEXT_PUBLIC_USER_NAME=<>>
```

Then go to your supabase dashboard and in `Authentication`, press `Add user`:

```
email: dev@gmail.com
password: dev
```

### Dumping the database to file

Use `scripts/download_storage.ts` to download the storage files from the database to a local directory.

### Observability

- `supabase inspect db` has good tools

### Requirements

- Node.js >= 18.17.0
- pnpm 8

### Scripts

- `pnpm dev` — Starts the application in development mode at `http://localhost:3000`.
- `pnpm build` — Creates an optimized production build of your application.
- `pnpm start` — Starts the application in production mode.
- `pnpm type-check` — Validate code using TypeScript compiler.
- `pnpm lint` — Runs ESLint for all files in the `src` directory.
- `pnpm format-check` — Runs Prettier and checks if any files have formatting issues.
- `pnpm format` — Runs Prettier and formats files.
- `pnpm test` — Runs all the jest tests in the project.
- `pnpm test:ci` — Runs all the jest tests in the project, Jest will assume it is running in a CI environment.
- `pnpm analyze` — Builds the project and opens the bundle analyzer.
- `pnpm gen-api-docs` — Generates OpenAPI docs.
- `pnpm gen-types` — Generates TypeScript types from the remote Supabase instance.
- `pnpm dev:gen-types` — Generates TypeScript types from the local Supabase instance.
- `pnpm dev:importdata` — Imports data from the archive folder into the local database.

### Paths

TypeScript is pre-configured with custom path mappings. To import components or files, use the `@` prefix.

```tsx
import { Button } from '@/components/ui/Button'

// To import images or other files from the public folder
import avatar from '@/public/avatar.png'
```

.

# What data from the archive do we use?

Your archive gets processed locally and only the following data ever leaves your machine.

If you want to be 100% sure about your privacy, you can remove everything else from the data folder.

| File               | Contains                                               | Why We Need                                        |
| ------------------ | ------------------------------------------------------ | -------------------------------------------------- |
| tweets.js          | Tweet data, including text, timestamps, and metadata   | Core content for user's timeline                   |
| following.js       | List of accounts user follows                          | Show user's network, interests                     |
| follower.js        | List of accounts following user                        | Show user's influence, popularity                  |
| account.js         | Basic account info like email, username, creation date | Identify user, show account age                    |
| profile.js         | User's profile data like bio, location, avatar         | Display user info in UI                            |
| note-tweet.js      | Full text of long tweets                               | Complete content for tweets truncated in tweets.js |
| community-tweet.js | Tweets from twitter communities, which are all public  | Same reason as we need other tweets                |
| like.js (optional) | Tweets user has liked                                  | Show user's interests, engagement                  |

## Examples

tweets.js:

```json
window.YTD.tweets.part1 = [
  {
    "tweet" : {
      "edit_info" : {
        "initial" : {
          "editTweetIds" : [
            "1626922779105759235"
          ],
          "editableUntil" : "2023-02-18T13:03:11.000Z",
          "editsRemaining" : "5",
          "isEditEligible" : false
        }
      },
      "retweeted" : false,
      "source" : "<a href=\"https://mobile.twitter.com\" rel=\"nofollow\">Twitter Web App</a>",
      "entities" : {
        "hashtags" : [ ],
        "symbols" : [ ],
        "user_mentions" : [
          {
            "name" : "Cameron (🇵🇹)",
            "screen_name" : "empathy2000",
            "indices" : [
              "0",
              "12"
            ],
            "id_str" : "732980797985148928",
            "id" : "732980797985148928"
          }
        ],
        "urls" : [ ]
      },
      "display_text_range" : [
        "0",
        "71"
      ],
      "favorite_count" : "1",
      "in_reply_to_status_id_str" : "1626916612560281601",
      "id_str" : "1626922779105759235",
      "in_reply_to_user_id" : "732980797985148928",
      "truncated" : false,
      "retweet_count" : "0",
      "id" : "1626922779105759235",
      "in_reply_to_status_id" : "1626916612560281601",
      "created_at" : "Sat Feb 18 12:33:11 +0000 2023",
      "favorited" : false,
      "full_text" : "@empathy2000 did NOT know but now I'm listening to her solo act bc of u",
      "lang" : "en",
      "in_reply_to_screen_name" : "empathy2000",
      "in_reply_to_user_id_str" : "732980797985148928"
    }
  }
```

following.js:

```json
window.YTD.following.part0 = [
  {
    "following" : {
      "accountId" : "824308056351735809",
      "userLink" : "https://twitter.com/intent/user?user_id=824308056351735809"
    }
  },
  {
    "following" : {
      "accountId" : "18969923",
      "userLink" : "https://twitter.com/intent/user?user_id=18969923"
    }
  },
  {
    "following" : {
      "accountId" : "3297675443",
      "userLink" : "https://twitter.com/intent/user?user_id=3297675443"
    }
  }
]
```

follower.js:

```json
window.YTD.follower.part0 = [
  {
    "follower" : {
      "accountId" : "1252851",
      "userLink" : "https://twitter.com/intent/user?user_id=1252851"
    }
  },
  {
    "follower" : {
      "accountId" : "1310630474755178496",
      "userLink" : "https://twitter.com/intent/user?user_id=1310630474755178496"
    }
  },
  {
    "follower" : {
      "accountId" : "1265789414023651328",
      "userLink" : "https://twitter.com/intent/user?user_id=1265789414023651328"
    }
  }
]
```

account.js:

```json
window.YTD.account.part0 = [
  {
    "account" : {
      "email" : "theexgenesis@gmail.com",
      "createdVia" : "web",
      "username" : "exGenesis",
      "accountId" : "322603863",
      "createdAt" : "2011-06-23T13:04:14.000Z",
      "accountDisplayName" : "❤️‍🔥 xiq"
    }
  }
]
```

profile.js:

```json
window.YTD.profile.part0 = [
  {
    "profile" : {
      "description" : {
        "bio" : "Grug's bio here",
        "website" : "https://grug.com",
        "location" : "Cave"
      },
      "avatarMediaUrl" : "https://pbs.twimg.com/profile_images/grug.jpg",
      "headerMediaUrl" : "https://pbs.twimg.com/profile_banners/grug_banner.jpg"
    }
  }
]
```

note-tweet.js:

```json
window.YTD.note_tweet.part0 = [
  {
    "noteTweet" : {
      "noteTweetId" : "1234567890",
      "noteTweetResults" : {
        "text" : "This is a long tweet by Grug. It goes over 280 characters so it's stored here.",
        "entitySet" : {
          "hashtags" : [ ],
          "symbols" : [ ],
          "userMentions" : [ ],
          "urls" : [ ]
        }
      },
      "tweetId" : "9876543210"
    }
  }
]
```

like.js:

```json
window.YTD.like.part1 = [
  {
    "like" : {
      "tweetId" : "16270389803521472158",
      "fullText" : "They're so flat they're almost completely clear, except when the light catches them just right. You can read more in an article I wrote about them here: https://t.co/BhS444jEkF https://t.co/iFeHiZZdUn",
      "expandedUrl" : "https://twitter.com/i/web/status/1627038980352147458"
    }
  },
  {
    "like" : {
      "tweetId" : "16270386918259250720",
      "fullText" : "Sea sapphires are some of the most beautiful animals on Earth.\nTheir bodies contain microscopic crystals that reflect blue light. They use this shine in courtship displays, &amp; in Japan, fishers call this tama-mizu: jeweled water.\n📽️ https://t.co/NI2DioTKA4\nhttps://t.co/Koww4X3sXB",
      "expandedUrl" : "https://twitter.com/i/web/status/1627038691825950720"
    }
  },
  {
    "like" : {
      "tweetId" : "16270394452530201219",
      "fullText" : "https://t.co/erVoNQELZ2",
      "expandedUrl" : "https://twitter.com/i/web/status/1627039445253001219"
    }
  }
]
```

community-tweet.json

````json
window.YTD.community_tweet.part0 = [
  {
    "tweet" : {
      "retweeted" : false,
      "source" : "<a href=\"http://twitter.com/download/android\" rel=\"nofollow\">Twitter for Android</a>",
      "entities" : {
        "hashtags" : [ ],
        "symbols" : [ ],
        "user_mentions" : [ ],
        "urls" : [ ]
      },
      "display_text_range" : [
        "0",
        "25"
      ],
      "favorite_count" : "10",
      "id_str" : "1611701861727313922",
      "scopes" : {
        "followers" : false
      },
      "truncated" : false,
      "retweet_count" : "0",
      "id" : "1611701861727313922",
      "community_id" : "1611684946967412736",
      "community_id_str" : "1611684946967412736",
      "created_at" : "Sat Jan 07 12:30:42 +0000 2023",
      "favorited" : false,
      "full_text" : "Hey friends miss u dearly",
      "lang" : "en"
    }
  }
]```


````

# Schema

CREATE TABLE IF NOT EXISTS public.tweets (
tweet_id TEXT PRIMARY KEY,
account_id TEXT NOT NULL,
created_at TIMESTAMP WITH TIME ZONE NOT NULL,
full_text TEXT NOT NULL,
retweet_count INTEGER NOT NULL,
favorite_count INTEGER NOT NULL,
reply_to_tweet_id TEXT,
reply_to_user_id TEXT,
reply_to_username TEXT,
archive_upload_id BIGINT NOT NULL,

    FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
    FOREIGN KEY (account_id) REFERENCES public.all_account (account_id)

);

ALTER TABLE public.tweets DROP COLUMN IF EXISTS fts;
ALTER TABLE public.tweets ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('english', full_text)) STORED;
CREATE INDEX IF NOT EXISTS text_fts ON public.tweets USING gin (fts);

CREATE INDEX "idx_tweets_account_id" ON "public"."tweets" USING "btree" ("account_id");

CREATE INDEX "idx_tweets_archive_upload_id" ON "public"."tweets" USING "btree" ("archive_upload_id");

CREATE INDEX "idx_tweets_created_at" ON "public"."tweets" USING "btree" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS idx_tweets_reply_to_user_id ON public.tweets USING btree (reply_to_user_id) TABLESPACE pg_default;

CREATE INDEX idx_favorite_count ON tweets (favorite_count);
CREATE INDEX idx_tweets_updated_at ON tweets (updated_at);

CREATE TABLE IF NOT EXISTS public.tweet_urls (
id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
url TEXT NOT NULL,
expanded_url TEXT NOT NULL,
display_url TEXT NOT NULL,
tweet_id TEXT NOT NULL,
FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id),
UNIQUE(tweet_id, url)
);

CREATE INDEX "idx_tweet_urls_tweet_id" ON "public"."tweet_urls" USING "btree" ("tweet_id");

CREATE TABLE IF NOT EXISTS public.all_profile (
account_id TEXT PRIMARY KEY,  
 bio TEXT,
website TEXT,
location TEXT,
avatar_media_url TEXT,
header_media_url TEXT,
archive_upload_id BIGINT NOT NULL,
UNIQUE (account_id, archive_upload_id),
FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
FOREIGN KEY (account_id) REFERENCES public.all_account (account_id)
);

CREATE TABLE IF NOT EXISTS public.tweet_media (
media_id BIGINT PRIMARY KEY,
tweet_id TEXT NOT NULL,
media_url TEXT NOT NULL,
media_type TEXT NOT NULL,
WIDTH INTEGER NOT NULL,
HEIGHT INTEGER NOT NULL,
archive_upload_id BIGINT NOT NULL,
FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id),
FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id)
);

CREATE INDEX "idx_tweet_media_archive_upload_id" ON "public"."tweet_media" USING "btree" ("archive_upload_id");

CREATE INDEX "idx_tweet_media_tweet_id" ON "public"."tweet_media" USING "btree" ("tweet_id");

CREATE INDEX "idx_profile_archive_upload_id" ON "public"."profile" USING "btree" ("archive_upload_id");

CREATE TABLE IF NOT EXISTS public.all_account (
account_id TEXT PRIMARY KEY,
created_via TEXT NOT NULL,
username TEXT NOT NULL,
created_at TIMESTAMP WITH TIME ZONE NOT NULL,
account_display_name TEXT NOT NULL,
num_tweets INTEGER DEFAULT 0,
num_following INTEGER DEFAULT 0,
num_followers INTEGER DEFAULT 0,
num_likes INTEGER DEFAULT 0
);

CREATE TYPE upload_phase_enum AS ENUM ('uploading', 'ready_for_commit', 'committing', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS public.archive_upload (
id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
account_id TEXT NOT NULL,
archive_at TIMESTAMP WITH TIME ZONE NOT NULL,
created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
keep_private BOOLEAN DEFAULT FALSE,
upload_likes BOOLEAN DEFAULT TRUE,
start_date DATE,
end_date DATE,
upload_phase upload_phase_enum DEFAULT 'uploading',
UNIQUE (account_id, archive_at),
FOREIGN KEY (account_id) REFERENCES public.all_account (account_id)
);

ALTER TABLE public.archive_upload ADD COLUMN upload_phase upload_phase_enum DEFAULT 'uploading';

CREATE INDEX "idx_archive_upload_account_id" ON "public"."archive_upload" USING "btree" ("account_id");

CREATE TABLE IF NOT EXISTS public.user_mentions (
id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
mentioned_user_id TEXT NOT NULL,
tweet_id TEXT NOT NULL,
FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id),
FOREIGN KEY (mentioned_user_id) REFERENCES public.mentioned_users (user_id),
UNIQUE(mentioned_user_id, tweet_id)
);

CREATE INDEX "idx_user_mentions_mentioned_user_id" ON "public"."user_mentions" USING "btree" ("mentioned_user_id");

CREATE INDEX "idx_user_mentions_tweet_id" ON "public"."user_mentions" USING "btree" ("tweet_id");

CREATE TABLE IF NOT EXISTS public.mentioned_users (
user_id TEXT PRIMARY KEY,
name TEXT NOT NULL,
screen_name TEXT NOT NULL,
updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.likes (
id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
account_id TEXT NOT NULL,
liked_tweet_id TEXT NOT NULL,
archive_upload_id BIGINT NOT NULL,
UNIQUE (account_id, liked_tweet_id),
FOREIGN KEY (account_id) REFERENCES public.all_account (account_id),
FOREIGN KEY (liked_tweet_id) REFERENCES public.liked_tweets (tweet_id),
FOREIGN KEY (archive_upload_id) REFERENCES public.archive_upload (id)
);

CREATE INDEX "idx_likes_account_id" ON "public"."likes" USING "btree" ("account_id");

CREATE INDEX "idx_likes_archive_upload_id" ON "public"."likes" USING "btree" ("archive_upload_id");

CREATE INDEX "idx_likes_liked_tweet_id" ON "public"."likes" USING "btree" ("liked_tweet_id");

CREATE TABLE IF NOT EXISTS public.liked_tweets (
tweet_id TEXT PRIMARY KEY,
full_text TEXT NOT NULL,
fts tsvector GENERATED ALWAYS AS (to_tsvector('english', full_text)) STORED
);

CREATE INDEX IF NOT EXISTS text_fts ON public.liked_tweets USING gin (fts);

CREATE TABLE IF NOT EXISTS "public"."conversations" (
"tweet_id" text NOT NULL PRIMARY KEY,
"conversation_id" text,
FOREIGN KEY (tweet_id) REFERENCES public.tweets(tweet_id)
);

CREATE INDEX idx_conversation_id ON public.conversations(conversation_id);
