# Twitter Circle Mitigation

Here we find and eliminate circle tweets from the database.

## Steps

1. Fetch potential circle tweets from the community archive
2. Identify circle tweets by querying the syndication api
3. Eliminate circle tweets from the database

### Potential Circle Tweets

Potential circle tweets are top-level tweets created between August 2022 and November 2023.

### Syndication API

We use the syndication api to query the twitter api and get the latest tweet from a user.

### Identify Circle Tweets

We identify circle tweets by querying the syndication api and seeing if it returns a tweet or not.

### Eliminate Circle Tweets

We eliminate circle tweets from the database by deleting those tweets and any tweets downstream of those from the database.

## Data
