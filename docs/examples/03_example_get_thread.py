from supabase import create_client, Client
from typing import Dict, List, Optional, TypedDict  # Added TypedDict
from datetime import datetime

# --- Setup (replace with your actual credentials) ---
SUPABASE_URL = "YOUR_SUPABASE_URL"
SUPABASE_KEY = "YOUR_SUPABASE_KEY"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
# --- End Setup ---


class BaseTweetSchema(TypedDict):
    tweet_id: str
    account_id: str
    username: str
    created_at: datetime
    full_text: str
    favorite_count: int
    retweet_count: int
    reply_to_tweet_id: Optional[str]
    reply_to_user_id: Optional[str]
    reply_to_username: Optional[str]
    conversation_id: Optional[str]  # Added for this example


def get_tweets_by_conversation_id(
    supabase: Client, conversation_id: str
) -> List[BaseTweetSchema]:
    """
    Get all tweets that belong to the given conversation ID, ordered by creation time.
    """
    if not conversation_id:
        return []

    response = (
        supabase.table(
            "tweets_w_conversation_id"
        )  # Assumes a view or table that links tweets to conversation_ids
        .select(
            """
            tweet_id,
            account_id,
            username,
            created_at,
            full_text,
            favorite_count,
            retweet_count,
            reply_to_tweet_id,
            reply_to_user_id,
            reply_to_username,
            conversation_id 
            """
        )
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
    )
    return response.data


# Example usage:
if __name__ == "__main__":
    # Assuming 'root_tweet_id_of_thread' is the ID of the first tweet in a conversation.
    # In many cases, the conversation_id is the same as the root tweet's ID.
    thread_conversation_id = (
        "ROOT_TWEET_ID_OF_THREAD"  # Replace with a real conversation/root tweet ID
    )
    thread_tweets = get_tweets_by_conversation_id(supabase, thread_conversation_id)

    if thread_tweets:
        print(
            f"Found {len(thread_tweets)} tweets in conversation {thread_conversation_id}:"
        )
        for tweet in thread_tweets:
            print(
                f"- @{tweet.get('username', 'N/A')}: {tweet.get('full_text','')[:50]}..."
            )
    else:
        print(f"No tweets found for conversation {thread_conversation_id}.")
