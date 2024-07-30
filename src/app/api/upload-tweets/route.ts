import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'
import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'


export async function POST(request: Request) {
    const { content } = await request.json()
    const cookieStore = cookies()
    const supabase = createServerClient(cookieStore)

    try {
        console.log(content)
        const a = { "tweet": { "edit_info": { "initial": { "editTweetIds": ["1626871062343327744"], "editableUntil": "2023-02-18T09:37:41.000Z", "editsRemaining": "5", "isEditEligible": false } }, "retweeted": false, "source": "<a href=\"http://twitter.com/download/android\" rel=\"nofollow\">Twitter for Android</a>", "entities": { "hashtags": [], "symbols": [], "user_mentions": [{ "name": "🐇🌷bosco🌷🐇", "screen_name": "selentelechia", "indices": ["0", "14"], "id_str": "990430425825755138", "id": "990430425825755138" }, { "name": "Mark", "screen_name": "meditationstuff", "indices": ["15", "31"], "id_str": "2587393812", "id": "2587393812" }], "urls": [] }, "display_text_range": ["0", "54"], "favorite_count": "1", "in_reply_to_status_id_str": "1626870349575880705", "id_str": "1626871062343327744", "in_reply_to_user_id": "990430425825755138", "truncated": false, "retweet_count": "0", "id": "1626871062343327744", "in_reply_to_status_id": "1626870349575880705", "created_at": "Sat Feb 18 09:07:41 +0000 2023", "favorited": false, "full_text": "@selentelechia @meditationstuff omg me for like a year", "lang": "en", "in_reply_to_screen_name": "selentelechia", "in_reply_to_user_id_str": "990430425825755138" } }
        // Process and insert tweets
        const { data, error } = await supabase
            .from('dev_tweets')
            .upsert(
                content.map((tweet: any) => ({
                    tweet_id: tweet.id_str,
                    full_text: tweet.full_text,
                    created_at: tweet.created_at,
                    favorite_count: tweet.favorite_count,
                    retweet_count: tweet.retweet_count,
                    account_id: tweet.user.id_str,
                    is_retweet: tweet.retweeted_status ? true : false,
                    lang: tweet.lang,
                    possibly_sensitive: tweet.possibly_sensitive,
                    reply_to_tweet_id: tweet.in_reply_to_status_id_str,
                    reply_to_user_id: tweet.in_reply_to_user_id_str,
                    reply_to_username: tweet.in_reply_to_screen_name,
                    source: tweet.source,
                })),
                { onConflict: 'tweet_id' }
            )

        if (error) throw error

        return NextResponse.json({ success: true, message: 'Tweets uploaded and processed successfully' })
    } catch (error) {
        console.error('Error processing tweets:', error)
        return NextResponse.json({ success: false, message: 'Error processing tweets' }, { status: 500 })
    }
}