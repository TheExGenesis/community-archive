# %%
import tqdm
import os
import supabase
import pandas as pd
from typing import List
from toolz import partition_all
from supabase import create_client, Client
from dotenv import load_dotenv
import os.path

# Determine the script's directory and project root
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(script_dir, "../../.."))

# Load environment variables from the project root .env file
dotenv_path = os.path.join(project_root, "open-birdsite-db", ".env")
load_dotenv(dotenv_path)
# Upload the modified archives to Supabase Storage
BATCH_SIZE = 100

# Initialize Supabase client
supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.getenv("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE")
if not supabase_url or not supabase_key:
    raise ValueError(
        "Supabase URL or Service Role Key not found in environment variables."
    )
supabase: Client = create_client(supabase_url, supabase_key)

# %%
# Delete the suspected circle tweets and their related data from the database

# Ensure the set of IDs is loaded
if "suspected_circle_tweets_and_conversations_ids" not in locals():
    print("Loading suspected circle tweet IDs from CSV...")
    suspected_circle_tweets_and_conversations_ids_df = pd.read_csv(
        "/Users/frsc/Documents/Projects/open-birdsite-db/data/circle-mitigation/circle_and_conversation_tweet_ids.csv",
        dtype={"tweet_id": str},
    )
    suspected_circle_tweets_and_conversations_ids = set(
        suspected_circle_tweets_and_conversations_ids_df.tweet_id
    )
    print(f"Loaded {len(suspected_circle_tweets_and_conversations_ids)} IDs.")


def delete_batch(table_name: str, column_name: str, ids: List[str]):
    if not ids:
        print(f"No IDs to delete for {table_name}, skipping.")
        return
    print(
        f"Deleting batch of {len(ids)} from {table_name} where {column_name} in batch..."
    )
    try:
        result = supabase.table(table_name).delete().in_(column_name, ids).execute()
        # Supabase delete doesn't return count, so we just log success/failure
        print(f"Batch deletion attempt for {table_name} finished.")
    except Exception as e:
        print(f"Error deleting batch from {table_name}: {e}")


# %%
# Process deletions in batches
ids_to_delete = list(suspected_circle_tweets_and_conversations_ids)

print(f"\n--- Deleting related data from dependent tables --- ")

print(f"\n--- Deleting from public.user_mentions --- ")
for batch in tqdm.tqdm(partition_all(BATCH_SIZE, ids_to_delete)):
    delete_batch("user_mentions", "tweet_id", list(batch))

print(f"\n--- Deleting from public.tweet_media --- ")
for batch in tqdm.tqdm(partition_all(BATCH_SIZE, ids_to_delete)):
    delete_batch("tweet_media", "tweet_id", list(batch))

print(f"\n--- Deleting from public.conversations --- ")
for batch in tqdm.tqdm(partition_all(BATCH_SIZE, ids_to_delete)):
    delete_batch("conversations", "tweet_id", list(batch))

# %%

print(f"\n--- Deleting from public.tweet_urls ---")
for batch in tqdm.tqdm(partition_all(BATCH_SIZE, ids_to_delete)):
    delete_batch("tweet_urls", "tweet_id", list(batch))


print(f"\n--- Deleting from public.tweets --- ")
for batch in tqdm.tqdm(partition_all(BATCH_SIZE, ids_to_delete)):  # Removed [:5] slice
    delete_batch("tweets", "tweet_id", list(batch))
# %%
print(f"\n--- Deleting from public.likes --- ")
for batch in tqdm.tqdm(partition_all(BATCH_SIZE, ids_to_delete)):
    delete_batch("likes", "liked_tweet_id", list(batch))

print(f"\n--- Deleting from public.liked_tweets --- ")
for batch in tqdm.tqdm(partition_all(BATCH_SIZE, ids_to_delete)):
    delete_batch("liked_tweets", "tweet_id", list(batch))


print("\nFinished deleting suspected circle tweets and related data from all tables.")

# %%
