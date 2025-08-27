from supabase import create_client, Client
from typing import Dict, List, Optional, TypedDict  # Added TypedDict
from datetime import datetime

# --- Setup (replace with your actual credentials) ---
SUPABASE_URL = "YOUR_SUPABASE_URL"
SUPABASE_KEY = "YOUR_SUPABASE_KEY"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
# --- End Setup ---


class ArchiveTweetData(TypedDict):
    tweet_id: str
    account_id: str
    created_at: datetime
    full_text: str
    retweet_count: int
    favorite_count: int
    reply_to_tweet_id: Optional[str]
    reply_to_user_id: Optional[str]
    reply_to_username: Optional[str]


def get_tweets_by_ids(
    supabase: Client, tweet_ids: List[str]
) -> Dict[str, ArchiveTweetData]:
    """
    Get tweets that exist for the given tweet IDs.
    Returns dict of tweet_id -> tweet data
    """
    if not tweet_ids:
        return {}
    response = supabase.table("tweets").select("*").in_("tweet_id", tweet_ids).execute()
    # Ensure all returned rows are dicts, matching ArchiveTweetData structure if possible
    # This is a simplification; real data might need more transformation
    return {row["tweet_id"]: row for row in response.data if isinstance(row, dict)}


# Example usage:
if __name__ == "__main__":
    tweet_ids_to_fetch = ["12345", "67890"]  # Replace with real tweet IDs
    tweets = get_tweets_by_ids(supabase, tweet_ids_to_fetch)

    if tweets:
        for tweet_id, tweet_data in tweets.items():
            print(
                f"Tweet ID: {tweet_id}, Text: {tweet_data.get('full_text','')[:50]}..."
            )
    else:
        print("No tweets found for the given IDs.")
