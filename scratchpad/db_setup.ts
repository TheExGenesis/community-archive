import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import {
  insertAccount,
  insertTweet,
  processTwitterArchive,
} from '../src/lib-server/db_insert'

import { pipe } from '../src/lib-server/fp'

// Load environment variables from .env file in the scratchpad directory
dotenv.config({ path: path.resolve(__dirname, '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase URL and key must be provided in environment variables',
  )
}

const supabase = createClient(supabaseUrl, supabaseKey)

const readJsJson = (data: string) => {
  const dataJson = data.slice(data.indexOf('['))
  return JSON.parse(dataJson)
}

async function main() {
  // load the data in data/exgenesis-archive/data/tweets-dev.js as a json string
  // it starts with "window.YTD.tweets.part0 = [" so slice until the first [
  const fs = require('fs')
  const tweetsData = fs.readFileSync(
    path.resolve(__dirname, '../../data/exgenesis-archive/data/tweets-dev.js'),
    'utf8',
  )
  const accountData = fs.readFileSync(
    path.resolve(__dirname, '../../data/exgenesis-archive/data/account.js'),
    'utf8',
  )
  // console.log(accountData)
  const account = pipe(readJsJson, (as) => as[0].account)(accountData)

  console.log(account)

  // patch with account id
  const tweets = pipe(readJsJson, (ts) =>
    ts.map((tweet: any) => {
      tweet.tweet.user_id = account.accountId
      tweet.tweet.user_id_str = account.accountId
      return tweet
    }),
  )(tweetsData)
  const tweet = tweets[0]
  console.log(tweet)
  // console.log(tweets.map((tweet: any) => tweet.tweet?.entities))

  // console.log(insertAccount(account)) // works
  console.log(await insertTweet(tweet))
}

main().catch(console.error)
