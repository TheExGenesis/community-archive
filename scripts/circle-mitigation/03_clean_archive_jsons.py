# We begin by finding all the tweets in conversations that start with circle tweets that we found. We do this by loading the ids we think are circle tweets, and querying the public.conversations table in the CA
# %%
import os
import pandas as pd
from typing import List, Iterator
from toolz import partition_all
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv("/Users/frsc/Documents/Projects/open-birdsite-db/open-birdsite-db/.env")

# Initialize Supabase client
supabase: Client = create_client(
    os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
    os.getenv("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE"),
)

SUSPECTED_CIRCLE_TWEET_IDS_PATH = "/Users/frsc/Documents/Projects/open-birdsite-db/data/circle-mitigation/isCircleTweet"
# these have dirs whose names are user_ids, and then have files named like socialdata_1558616329686601729.json and syndication_1558616329686601729.json
# we want to get all these ids into a dataframe

suspected_circle_tweet_ids = []
for user_id in os.listdir(SUSPECTED_CIRCLE_TWEET_IDS_PATH):
    user_path = os.path.join(SUSPECTED_CIRCLE_TWEET_IDS_PATH, user_id)
    for file in os.listdir(user_path):
        if file.endswith(".json"):
            tweet_id = file.split("_")[1].split(".")[0]
            suspected_circle_tweet_ids.append(
                {"tweet_id": str(tweet_id), "user_id": user_id}
            )
suspected_circle_tweet_ids = pd.DataFrame(suspected_circle_tweet_ids)
suspected_circle_tweet_ids.set_index("tweet_id", inplace=True)
# %%
INPUT_DIR = "/Users/frsc/Documents/Projects/open-birdsite-db/data/downloads/archives"  # <USERNAME>/archive.json
OUTPUT_DIR = "/Users/frsc/Documents/Projects/open-birdsite-db/data/circle-mitigation/archives-no-circle-tweets"

users_to_check = ["myceliummage", "__drewface"]
import json
from typing import Dict, Set


# def load_user_archive(username: str) -> Dict:
#     """Load a user's archive file"""
#     user_path = os.path.join(INPUT_DIR, username)
#     for file in os.listdir(user_path):
#         if file.endswith("archive.json"):
#             archive_path = os.path.join(user_path, file)
#             return json.load(open(archive_path))
#     return {"tweets": []}


# def extract_tweet_ids(archive: Dict) -> Set[str]:
#     """Extract tweet IDs from an archive"""
#     return set(str(t["tweet"]["id"]) for t in archive.get("tweets", []))


# # Load archives and extract tweet IDs for all users
# user_tweet_ids = {}
# for username in users_to_check:
#     archive = load_user_archive(username)
#     user_tweet_ids[username] = extract_tweet_ids(archive)

# # Combine all user tweet IDs
# all_user_ids = set().union(*user_tweet_ids.values())
# %%
tweet_ids = set(suspected_circle_tweet_ids.index)

# %%
print(f"{len(tweet_ids)} suspected circle tweet ids")

# Convert tweet_ids to list for batching


# Function to fetch conversations for a batch of tweet_ids
def fetch_conversations_batch(ids: List[str]) -> pd.DataFrame:
    result = (
        supabase.table("conversations")
        .select("*")
        .in_("conversation_id", ids)
        .execute()
    )
    df = pd.DataFrame(result.data)
    # Ensure relevant columns are string type
    if not df.empty:
        if "conversation_id" in df.columns:
            df["conversation_id"] = df["conversation_id"].astype(str)
        if "tweet_id" in df.columns:
            df["tweet_id"] = df["tweet_id"].astype(str)
    return df


# %%
# Process in batches using toolz
BATCH_SIZE = 100
conversation_dfs = []
for batch in partition_all(BATCH_SIZE, tweet_ids):
    batch_df = fetch_conversations_batch(list(batch))
    conversation_dfs.append(batch_df)
# %%
# Combine all results
all_conversations = (
    pd.concat(conversation_dfs, ignore_index=True)
    if conversation_dfs
    else pd.DataFrame()
)

# all_conversations = all_conversations[
#     ~all_conversations.conversation_id.isin(list(all_user_ids))
# ]
print(f"Found {len(all_conversations)} conversations in supabase db")

# %%
# in rerequest_circles, we requested all of the tweets above to distinguish circle tweets from tweets coming threads started by deleted accounts - visible tweets will have more than 1KB and so can be discarded
import os

REREQUEST_PATH = "/Users/frsc/Documents/Projects/open-birdsite-db/data/circle-mitigation/rerequest_circles"  # contains files <TWEETID>.json
rerequest_ids = [f.split(".")[0] for f in os.listdir(REREQUEST_PATH)]
rerequest_circle_tweet_ids = [
    f.split(".")[0]
    for f in os.listdir(REREQUEST_PATH)
    if os.path.getsize(os.path.join(REREQUEST_PATH, f)) < 1024
]
print(
    f"Found {len(rerequest_circle_tweet_ids)}/{len(rerequest_ids)} rerequest circle tweet ids"
)


# %%
all_conversations.value_counts("conversation_id")
# %%
# let's write the union of tweet_ids we found and the tweet ids we had before
suspected_circle_tweets_and_conversations_ids = list(
    set(rerequest_circle_tweet_ids).union(set(tweet_ids))
)
print(f"{len(suspected_circle_tweets_and_conversations_ids)} union tweet ids")

# %%
# write to file
suspected_circle_tweets_and_conversations_ids_df = pd.DataFrame(
    suspected_circle_tweets_and_conversations_ids, columns=["tweet_id"]
)
suspected_circle_tweets_and_conversations_ids_df.to_csv(
    "/Users/frsc/Documents/Projects/open-birdsite-db/data/circle-mitigation/circle_and_conversation_tweet_ids.csv",
    index=False,
)
# %%
suspected_circle_tweets_and_conversations_ids_df = pd.read_csv(
    "/Users/frsc/Documents/Projects/open-birdsite-db/data/circle-mitigation/circle_and_conversation_tweet_ids.csv",
    dtype={"tweet_id": str},
)
suspected_circle_tweets_and_conversations_ids = set(
    suspected_circle_tweets_and_conversations_ids_df.tweet_id
)
# next we need all the archives
# we ran download_storage, now we're gonna load them all one at a time, remove tweets and liked tweets whose ids are in suspected_circle_tweets_and_conversations_ids, the save them again to a new folder, only the ones which suffered changes
import json


# The structure of this JSON is:

# ```js
# {
#   "account": {},// username, accountId, display name, etc..
#   "follower": {}, // list of accountId's of followers
#   "following": {}, // list of accountId's they follow
#   "profile": {}, // bio & URL to profile picture
#   "like": {}, // list of full text of each liked tweet
#   "tweets": {}, // list of tweets
# }
# ```

# we want to remove the tweets and the liked tweets whose ids are in suspected_circle_tweets_and_conversations_ids
import tqdm

for user_id in tqdm.tqdm(os.listdir(INPUT_DIR)):
    user_path = os.path.join(INPUT_DIR, user_id)
    for file in os.listdir(user_path):
        if file.endswith("archive.json"):
            archive_path = os.path.join(user_path, file)
            archive = json.load(open(archive_path))
            non_circle_tweets = [
                tweet
                for tweet in archive["tweets"]
                if str(tweet["tweet"].get("id"))
                not in suspected_circle_tweets_and_conversations_ids
            ]
            non_circle_liked_tweets = [
                like
                for like in archive["like"]
                if str(like["like"].get("tweetId"))
                not in suspected_circle_tweets_and_conversations_ids
            ]
            if len(non_circle_tweets) != len(archive["tweets"]) or len(
                non_circle_liked_tweets
            ) != len(archive["like"]):
                old_len_tweets = len(archive["tweets"])
                old_len_liked_tweets = len(archive["like"])
                archive["tweets"] = non_circle_tweets
                archive["like"] = non_circle_liked_tweets
                # write to file
                os.makedirs(os.path.join(OUTPUT_DIR, user_id), exist_ok=True)
                json.dump(archive, open(os.path.join(OUTPUT_DIR, user_id, file), "w"))
                print(
                    f"Wrote {file}, with {len(non_circle_tweets)}/{old_len_tweets} tweets and {len(non_circle_liked_tweets)}/{old_len_liked_tweets} liked tweets"
                )
            else:
                print(f"No changes for {file}")
