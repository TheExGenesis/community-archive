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
    account_id: str  # Assuming account_id is present
    created_at: datetime
    full_text: str
    username: Optional[str]  # Added username for the example function
    # ... other fields


def get_user_tweets_paginated(
    supabase: Client, username: str, page: int = 0, page_size: int = 100
) -> List[ArchiveTweetData]:
    """
    Get paginated tweets for a specific user, ordered by creation date descending.
    Note: The 'username' field might be in a related 'accounts' table or directly on 'tweets'.
          This example assumes 'username' is directly on the 'tweets' table or a view.
          For a more robust solution, you might need to join with an 'accounts' table to get account_id from username.
    """
    offset = page * page_size
    # This query assumes you have a way to filter by username directly or an account_id if you fetch that first.
    # If 'username' is not directly on the 'tweets' table, you'd first get 'account_id' for the username.
    # For this example, let's assume a 'tweets' table that includes username (might be a view).
    response = (
        supabase.table("tweets")  # Or a view like 'tweets_view_with_username'
        .select("*")
        .eq(
            "username", username
        )  # This line might need adjustment based on your schema
        .order("created_at", desc=True)
        .range(offset, offset + page_size - 1)
        .execute()
    )
    return response.data


# Example usage:
if __name__ == "__main__":
    target_username = "example_user"  # Replace with a real username
    current_page = 0
    page_size = 50  # Number of tweets per page

    print(f"Fetching tweets for @{target_username}...")
    while True:
        print(f"Fetching page {current_page}...")
        tweets_page = get_user_tweets_paginated(
            supabase, target_username, page=current_page, page_size=page_size
        )
        if not tweets_page:
            print("No more tweets found.")
            break

        for tweet in tweets_page:
            print(
                f"  Tweet ID: {tweet.get('tweet_id')}, Date: {tweet.get('created_at')}, Text: {tweet.get('full_text','')[:30]}..."
            )

        # To fetch the next page, uncomment below and remove 'break'
        # current_page += 1
        break  # For this example, only fetching the first page.
