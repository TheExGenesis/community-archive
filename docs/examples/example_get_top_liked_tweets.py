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
    username: str  # Assuming username is available
    created_at: datetime
    full_text: str
    favorite_count: int
    # ... other fields


def get_top_liked_tweets_by_user(
    supabase: Client, username: str, limit: int = 10
) -> List[ArchiveTweetData]:
    """
    Get the top N liked tweets for a specific user.
    Again, assumes 'username' is filterable on the 'tweets' table or a relevant view.
    """
    response = (
        supabase.table("tweets")  # Or a view
        .select("tweet_id, username, full_text, favorite_count, created_at")
        .eq("username", username)  # Adjust if filtering by account_id
        .order("favorite_count", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data


# Example usage:
if __name__ == "__main__":
    target_username = "example_user"  # Replace with a real username
    top_n = 5
    top_tweets = get_top_liked_tweets_by_user(supabase, target_username, limit=top_n)

    if top_tweets:
        print(f"Top {top_n} liked tweets for @{target_username}:")
        for i, tweet in enumerate(top_tweets):
            print(
                f"{i+1}. Likes: {tweet.get('favorite_count')}, Text: {tweet.get('full_text','')[:50]}... (ID: {tweet.get('tweet_id')})"
            )
    else:
        print(f"No tweets found or user @{target_username} not found.")
