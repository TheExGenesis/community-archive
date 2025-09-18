# %%
from supabase import create_client, Client
from typing import TypedDict, Optional  # Corrected import
from datetime import datetime  # Added for ArchiveTweetData

# --- Setup (replace with your actual credentials) ---
SUPABASE_URL = "https://fabxmporizzqflnftavs.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8"
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


def get_tweet_by_id(supabase: Client, tweet_id: str) -> Optional[ArchiveTweetData]:
    """
    Get a single tweet by its ID.
    """
    response = (
        supabase.table("tweets").select("*").eq("tweet_id", tweet_id).single().execute()
    )
    if response.data:
        return response.data
    return None


# Example usage:
if __name__ == "__main__":
    tweet_id_to_fetch = "1234567890123456789"  # Replace with a real tweet ID
    tweet = get_tweet_by_id(supabase, tweet_id_to_fetch)

    if tweet:
        print(f"Tweet ID: {tweet['tweet_id']}")
        print(f"Text: {tweet['full_text']}")
    else:
        print(f"Tweet with ID {tweet_id_to_fetch} not found.")

# %%
