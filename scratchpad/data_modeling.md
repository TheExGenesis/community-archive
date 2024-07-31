# Data Modeling

We have a few different files coming in from a twitter archive: `account.js`, `tweets.js`, `follower.js`, `following.js`

We need to process them and store them in a Supabase Postgres db.

We want to save pretty much everything as it is.

Separate tables for follower, following, account, and tweets need to be modelled by a few different tables.

## Supabase Postgres Table Creation

```sql
-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create table for account information
CREATE TABLE dev_account (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT,
    created_via TEXT,
    username TEXT,
    account_id TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE,
    account_display_name TEXT
);

-- Create table for tweets
CREATE TABLE dev_tweets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tweet_id TEXT UNIQUE,
    account_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    full_text TEXT,
    lang TEXT,
    retweet_count INTEGER,
    favorite_count INTEGER,
    reply_to_tweet_id TEXT,
    reply_to_user_id TEXT,
    reply_to_username TEXT,
    is_retweet BOOLEAN,
    source TEXT,
    possibly_sensitive BOOLEAN,
    FOREIGN KEY (account_id) REFERENCES dev_account(account_id)
);

-- Create table for tweet entities
CREATE TABLE dev_tweet_entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tweet_id TEXT,
    entity_type TEXT,
    entity_value TEXT,
    FOREIGN KEY (tweet_id) REFERENCES dev_tweets(tweet_id)
);

-- Create table for tweet media
CREATE TABLE dev_tweet_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tweet_id TEXT,
    media_url TEXT,
    media_type TEXT,
    width INTEGER,
    height INTEGER,
    FOREIGN KEY (tweet_id) REFERENCES dev_tweets(tweet_id)
);

-- Create table for followers
CREATE TABLE dev_followers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id TEXT,
    follower_account_id TEXT,
    FOREIGN KEY (account_id) REFERENCES dev_account(account_id)
);

-- Create table for following
CREATE TABLE dev_following (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id TEXT,
    following_account_id TEXT,
    FOREIGN KEY (account_id) REFERENCES dev_account(account_id)
);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE dev_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_tweets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_tweet_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_tweet_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_following ENABLE ROW LEVEL SECURITY;

-- (Optional) Create policies for each table if needed
-- Example policy for the account table:
CREATE POLICY "Users can view their own account" ON dev_account FOR SELECT
  USING (auth.uid() = id);

-- Remember to create similar policies for other tables as needed
```

## Supabase Insert

Example of inserting data into a table:

```js
const { error } = await supabase
  .from('countries')
  .insert({ id: 1, name: 'Denmark' })
```

## Examples

### Account

Account looks like this:

```js
window.YTD.account.part0 = [
  {
    account: {
      email: 'theexgenesis@gmail.com',
      createdVia: 'web',
      username: 'exGenesis',
      accountId: '322603863',
      createdAt: '2011-06-23T13:04:14.000Z',
      accountDisplayName: '❤️‍🔥 xiq',
    },
  },
]
```

### Tweets

Tweets look like this:

```js
window.YTD.tweets.part0 = [
  {
    tweet: {
      edit_info: {
        initial: {
          editTweetIds: ['1627031510963441664'],
          editableUntil: '2023-02-18T20:15:15.000Z',
          editsRemaining: '5',
          isEditEligible: false,
        },
      },
      retweeted: false,
      source:
        '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>',
      entities: {
        hashtags: [],
        symbols: [],
        user_mentions: [],
        urls: [],
      },
      display_text_range: ['0', '200'],
      favorite_count: '1',
      in_reply_to_status_id_str: '1627019761950375936',
      id_str: '1627031510963441664',
      in_reply_to_user_id: '322603863',
      truncated: false,
      retweet_count: '0',
      id: '1627031510963441664',
      in_reply_to_status_id: '1627019761950375936',
      created_at: 'Sat Feb 18 19:45:15 +0000 2023',
      favorited: false,
      full_text:
        "Another lesson is: there's a lot of trash, many not-very-contentful tweets, and it's not trivial to separate them, but we can always train a classifier, or honestly just use an LLM w few-shot examples",
      lang: 'en',
      in_reply_to_screen_name: 'exGenesis',
      in_reply_to_user_id_str: '322603863',
    },
  },
  {
    tweet: {
      edit_info: {
        initial: {
          editTweetIds: ['1627019761950375936'],
          editableUntil: '2023-02-18T19:28:34.000Z',
          editsRemaining: '5',
          isEditEligible: false,
        },
      },
      retweeted: false,
      source:
        '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>',
      entities: {
        user_mentions: [],
        urls: [],
        symbols: [],
        media: [
          {
            expanded_url:
              'https://twitter.com/exGenesis/status/1627019761950375936/photo/1',
            indices: ['280', '303'],
            url: 'https://t.co/XOWm3INJng',
            media_url: 'http://pbs.twimg.com/media/FpRUnGtX0AEvwY1.jpg',
            id_str: '1627018396180140033',
            id: '1627018396180140033',
            media_url_https: 'https://pbs.twimg.com/media/FpRUnGtX0AEvwY1.jpg',
            sizes: {
              medium: {
                w: '1176',
                h: '898',
                resize: 'fit',
              },
              small: {
                w: '680',
                h: '519',
                resize: 'fit',
              },
              thumb: {
                w: '150',
                h: '150',
                resize: 'crop',
              },
              large: {
                w: '1176',
                h: '898',
                resize: 'fit',
              },
            },
            type: 'photo',
            display_url: 'pic.twitter.com/XOWm3INJng',
          },
        ],
        hashtags: [],
      },
      display_text_range: ['0', '303'],
      favorite_count: '3',
      in_reply_to_status_id_str: '1626699961042698240',
      id_str: '1627019761950375936',
      in_reply_to_user_id: '322603863',
      truncated: false,
      retweet_count: '0',
      id: '1627019761950375936',
      in_reply_to_status_id: '1626699961042698240',
      possibly_sensitive: false,
      created_at: 'Sat Feb 18 18:58:34 +0000 2023',
      favorited: false,
      full_text:
        "into the thick of it!\n\nsome lessons:\n\nWe don't want clustering we want TOPIC MODELLING, tweets can be about more than 1 thing\n\nalso, topic modelling my tweets is HARD, my best stuff is interdisciplinary and that sends models for a loop\n\nanyway we got some coherent topics!!!!!!!! https://t.co/XOWm3INJng",
      lang: 'en',
      in_reply_to_screen_name: 'exGenesis',
      in_reply_to_user_id_str: '322603863',
      extended_entities: {
        media: [
          {
            expanded_url:
              'https://twitter.com/exGenesis/status/1627019761950375936/photo/1',
            indices: ['280', '303'],
            url: 'https://t.co/XOWm3INJng',
            media_url: 'http://pbs.twimg.com/media/FpRUnGtX0AEvwY1.jpg',
            id_str: '1627018396180140033',
            id: '1627018396180140033',
            media_url_https: 'https://pbs.twimg.com/media/FpRUnGtX0AEvwY1.jpg',
            sizes: {
              medium: {
                w: '1176',
                h: '898',
                resize: 'fit',
              },
              small: {
                w: '680',
                h: '519',
                resize: 'fit',
              },
              thumb: {
                w: '150',
                h: '150',
                resize: 'crop',
              },
              large: {
                w: '1176',
                h: '898',
                resize: 'fit',
              },
            },
            type: 'photo',
            display_url: 'pic.twitter.com/XOWm3INJng',
          },
          {
            expanded_url:
              'https://twitter.com/exGenesis/status/1627019761950375936/photo/1',
            indices: ['280', '303'],
            url: 'https://t.co/XOWm3INJng',
            media_url: 'http://pbs.twimg.com/media/FpRUuz6X0AETb-X.jpg',
            id_str: '1627018528573345793',
            id: '1627018528573345793',
            media_url_https: 'https://pbs.twimg.com/media/FpRUuz6X0AETb-X.jpg',
            sizes: {
              medium: {
                w: '1176',
                h: '898',
                resize: 'fit',
              },
              small: {
                w: '680',
                h: '519',
                resize: 'fit',
              },
              thumb: {
                w: '150',
                h: '150',
                resize: 'crop',
              },
              large: {
                w: '1176',
                h: '898',
                resize: 'fit',
              },
            },
            type: 'photo',
            display_url: 'pic.twitter.com/XOWm3INJng',
          },
          {
            expanded_url:
              'https://twitter.com/exGenesis/status/1627019761950375936/photo/1',
            indices: ['280', '303'],
            url: 'https://t.co/XOWm3INJng',
            media_url: 'http://pbs.twimg.com/media/FpRVfznXoAICT86.jpg',
            id_str: '1627019370307231746',
            id: '1627019370307231746',
            media_url_https: 'https://pbs.twimg.com/media/FpRVfznXoAICT86.jpg',
            sizes: {
              medium: {
                w: '1200',
                h: '760',
                resize: 'fit',
              },
              small: {
                w: '680',
                h: '431',
                resize: 'fit',
              },
              thumb: {
                w: '150',
                h: '150',
                resize: 'crop',
              },
              large: {
                w: '2048',
                h: '1298',
                resize: 'fit',
              },
            },
            type: 'photo',
            display_url: 'pic.twitter.com/XOWm3INJng',
          },
          {
            expanded_url:
              'https://twitter.com/exGenesis/status/1627019761950375936/photo/1',
            indices: ['280', '303'],
            url: 'https://t.co/XOWm3INJng',
            media_url: 'http://pbs.twimg.com/media/FpRV09rWIAEBXjz.jpg',
            id_str: '1627019733785518081',
            id: '1627019733785518081',
            media_url_https: 'https://pbs.twimg.com/media/FpRV09rWIAEBXjz.jpg',
            sizes: {
              medium: {
                w: '1200',
                h: '760',
                resize: 'fit',
              },
              small: {
                w: '680',
                h: '431',
                resize: 'fit',
              },
              thumb: {
                w: '150',
                h: '150',
                resize: 'crop',
              },
              large: {
                w: '2048',
                h: '1298',
                resize: 'fit',
              },
            },
            type: 'photo',
            display_url: 'pic.twitter.com/XOWm3INJng',
          },
        ],
      },
    },
  },
  {
    tweet: {
      edit_info: {
        initial: {
          editTweetIds: ['1626922779105759235'],
          editableUntil: '2023-02-18T13:03:11.000Z',
          editsRemaining: '5',
          isEditEligible: false,
        },
      },
      retweeted: false,
      source:
        '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>',
      entities: {
        hashtags: [],
        symbols: [],
        user_mentions: [
          {
            name: 'Cameron (🇵🇹)',
            screen_name: 'empathy2000',
            indices: ['0', '12'],
            id_str: '732980797985148928',
            id: '732980797985148928',
          },
        ],
        urls: [],
      },
      display_text_range: ['0', '71'],
      favorite_count: '1',
      in_reply_to_status_id_str: '1626916612560281601',
      id_str: '1626922779105759235',
      in_reply_to_user_id: '732980797985148928',
      truncated: false,
      retweet_count: '0',
      id: '1626922779105759235',
      in_reply_to_status_id: '1626916612560281601',
      created_at: 'Sat Feb 18 12:33:11 +0000 2023',
      favorited: false,
      full_text:
        "@empathy2000 did NOT know but now I'm listening to her solo act bc of u",
      lang: 'en',
      in_reply_to_screen_name: 'empathy2000',
      in_reply_to_user_id_str: '732980797985148928',
    },
  },
  {
    tweet: {
      edit_info: {
        initial: {
          editTweetIds: ['1626908498134020098'],
          editableUntil: '2023-02-18T12:06:27.000Z',
          editsRemaining: '5',
          isEditEligible: false,
        },
      },
      retweeted: false,
      source:
        '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>',
      entities: {
        hashtags: [],
        symbols: [],
        user_mentions: [
          {
            name: 'Cameron (🇵🇹)',
            screen_name: 'empathy2000',
            indices: ['0', '12'],
            id_str: '732980797985148928',
            id: '732980797985148928',
          },
        ],
        urls: [],
      },
      display_text_range: ['0', '25'],
      favorite_count: '1',
      in_reply_to_status_id_str: '1626904491957133312',
      id_str: '1626908498134020098',
      in_reply_to_user_id: '732980797985148928',
      truncated: false,
      retweet_count: '0',
      id: '1626908498134020098',
      in_reply_to_status_id: '1626904491957133312',
      created_at: 'Sat Feb 18 11:36:27 +0000 2023',
      favorited: false,
      full_text: "@empathy2000 I'm obsessed",
      lang: 'en',
      in_reply_to_screen_name: 'empathy2000',
      in_reply_to_user_id_str: '732980797985148928',
    },
  },
  {
    tweet: {
      edit_info: {
        initial: {
          editTweetIds: ['1626902980006932483'],
          editableUntil: '2023-02-18T11:44:31.000Z',
          editsRemaining: '5',
          isEditEligible: true,
        },
      },
      retweeted: false,
      source:
        '<a href="http://twitter.com/download/android" rel="nofollow">Twitter for Android</a>',
      entities: {
        hashtags: [],
        symbols: [],
        user_mentions: [],
        urls: [],
      },
      display_text_range: ['0', '122'],
      favorite_count: '8',
      id_str: '1626902980006932483',
      truncated: false,
      retweet_count: '0',
      id: '1626902980006932483',
      created_at: 'Sat Feb 18 11:14:31 +0000 2023',
      favorited: false,
      full_text:
        'music update:\n\nmy Spotify history for the past 48h has consisted solely of Caroline polacheck, jockstrap, and the pom-poms',
      lang: 'en',
    },
  },
  {
    tweet: {
      edit_info: {
        initial: {
          editTweetIds: ['1626871062343327744'],
          editableUntil: '2023-02-18T09:37:41.000Z',
          editsRemaining: '5',
          isEditEligible: false,
        },
      },
      retweeted: false,
      source:
        '<a href="http://twitter.com/download/android" rel="nofollow">Twitter for Android</a>',
      entities: {
        hashtags: [],
        symbols: [],
        user_mentions: [
          {
            name: '🐇🌷bosco🌷🐇',
            screen_name: 'selentelechia',
            indices: ['0', '14'],
            id_str: '990430425825755138',
            id: '990430425825755138',
          },
          {
            name: 'Mark',
            screen_name: 'meditationstuff',
            indices: ['15', '31'],
            id_str: '2587393812',
            id: '2587393812',
          },
        ],
        urls: [],
      },
      display_text_range: ['0', '54'],
      favorite_count: '1',
      in_reply_to_status_id_str: '1626870349575880705',
      id_str: '1626871062343327744',
      in_reply_to_user_id: '990430425825755138',
      truncated: false,
      retweet_count: '0',
      id: '1626871062343327744',
      in_reply_to_status_id: '1626870349575880705',
      created_at: 'Sat Feb 18 09:07:41 +0000 2023',
      favorited: false,
      full_text: '@selentelechia @meditationstuff omg me for like a year',
      lang: 'en',
      in_reply_to_screen_name: 'selentelechia',
      in_reply_to_user_id_str: '990430425825755138',
    },
  },
  {
    tweet: {
      edit_info: {
        initial: {
          editTweetIds: ['1626745546156257281'],
          editableUntil: '2023-02-18T01:18:56.000Z',
          editsRemaining: '5',
          isEditEligible: false,
        },
      },
      retweeted: false,
      source:
        '<a href="http://twitter.com/download/android" rel="nofollow">Twitter for Android</a>',
      entities: {
        hashtags: [],
        symbols: [],
        user_mentions: [
          {
            name: 'curious irrationalist {0/100 longform-ish things}',
            screen_name: '42irrationalist',
            indices: ['0', '16'],
            id_str: '1248684884790587393',
            id: '1248684884790587393',
          },
          {
            name: 'roon',
            screen_name: 'tszzl',
            indices: ['17', '23'],
            id_str: '1460283925',
            id: '1460283925',
          },
        ],
        urls: [],
      },
      display_text_range: ['0', '70'],
      favorite_count: '12',
      in_reply_to_status_id_str: '1626745216307720192',
      id_str: '1626745546156257281',
      in_reply_to_user_id: '1248684884790587393',
      truncated: false,
      retweet_count: '0',
      id: '1626745546156257281',
      in_reply_to_status_id: '1626745216307720192',
      created_at: 'Sat Feb 18 00:48:56 +0000 2023',
      favorited: false,
      full_text:
        "@42irrationalist @tszzl They're called Russian mountains in Portuguese",
      lang: 'en',
      in_reply_to_screen_name: '42irrationalist',
      in_reply_to_user_id_str: '1248684884790587393',
    },
  },
]
```

### Follower and following

```js
window.YTD.following.part0 = [
  {
    following: {
      accountId: '824308056351735809',
      userLink: 'https://twitter.com/intent/user?user_id=824308056351735809',
    },
  },
  {
    following: {
      accountId: '18969923',
      userLink: 'https://twitter.com/intent/user?user_id=18969923',
    },
  },
]
```

```js
window.YTD.follower.part0 = [
  {
    follower: {
      accountId: '1252851',
      userLink: 'https://twitter.com/intent/user?user_id=1252851',
    },
  },
  {
    follower: {
      accountId: '1310630474755178496',
      userLink: 'https://twitter.com/intent/user?user_id=1310630474755178496',
    },
  },
]
```
