# Examples of using Community Archive data

This document provides a series of self-contained examples demonstrating how to interact with and process data from the Community Archive.

## Setup

Before running these examples, ensure you have the necessary libraries installed and your Supabase credentials configured. Typically, you would have a `supabase` client initialized like this:

```python
from supabase import create_client, Client

# Replace with your actual Supabase URL and Key
SUPABASE_URL = "YOUR_SUPABASE_URL"
SUPABASE_KEY = "YOUR_SUPABASE_KEY"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
```

**Note:** For brevity, the Supabase client initialization will be omitted in the individual examples below but is required for them to run.

## Core Data Retrieval

### 1. Get a Specific Tweet by ID

This example shows how to retrieve a single tweet if you know its ID.

```python
# example_get_tweet.py
from supabase import create_client, Client
from typing import Dict, List, Optional

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


def get_tweet_by_id(supabase: Client, tweet_id: str) -> Optional[ArchiveTweetData]:
    """
    Get a single tweet by its ID.
    """
    response = supabase.table("tweets").select("*").eq("tweet_id", tweet_id).single().execute()
    if response.data:
        return response.data
    return None

# Example usage:
tweet_id_to_fetch = "1234567890123456789" # Replace with a real tweet ID
tweet = get_tweet_by_id(supabase, tweet_id_to_fetch)

if tweet:
    print(f"Tweet ID: {tweet['tweet_id']}")
    print(f"Text: {tweet['full_text']}")
else:
    print(f"Tweet with ID {tweet_id_to_fetch} not found.")

```

_See `example_get_tweet.py` for the runnable script._

### 2. Get Multiple Tweets by IDs

Retrieve a list of tweets based on a list of tweet IDs.

```python
# example_get_multiple_tweets.py
from supabase import create_client, Client
from typing import Dict, List, Optional
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

def get_tweets_by_ids(supabase: Client, tweet_ids: List[str]) -> Dict[str, ArchiveTweetData]:
    """
    Get tweets that exist for the given tweet IDs.
    Returns dict of tweet_id -> tweet data
    """
    if not tweet_ids:
        return {}
    response = supabase.table("tweets").select("*").in_("tweet_id", tweet_ids).execute()
    return {row["tweet_id"]: row for row in response.data}

# Example usage:
tweet_ids_to_fetch = ["12345", "67890"] # Replace with real tweet IDs
tweets = get_tweets_by_ids(supabase, tweet_ids_to_fetch)

if tweets:
    for tweet_id, tweet_data in tweets.items():
        print(f"Tweet ID: {tweet_id}, Text: {tweet_data['full_text'][:50]}...")
else:
    print("No tweets found for the given IDs.")
```

_See `example_get_multiple_tweets.py` for the runnable script._

### 3. Get Tweets for a Conversation Thread

This example demonstrates how to fetch all tweets belonging to a specific conversation ID. The `conversation_id` is typically the ID of the root tweet in a thread.

```python
# example_get_thread.py
from supabase import create_client, Client
from typing import Dict, List, Optional
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
    conversation_id: Optional[str] # Added for this example

def get_tweets_by_conversation_id(supabase: Client, conversation_id: str) -> List[BaseTweetSchema]:
    """
    Get all tweets that belong to the given conversation ID, ordered by creation time.
    """
    if not conversation_id:
        return []

    response = (
        supabase.table("tweets_w_conversation_id") # Assumes a view or table that links tweets to conversation_ids
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
# Assuming 'root_tweet_id_of_thread' is the ID of the first tweet in a conversation.
# In many cases, the conversation_id is the same as the root tweet's ID.
thread_conversation_id = "ROOT_TWEET_ID_OF_THREAD" # Replace with a real conversation/root tweet ID
thread_tweets = get_tweets_by_conversation_id(supabase, thread_conversation_id)

if thread_tweets:
    print(f"Found {len(thread_tweets)} tweets in conversation {thread_conversation_id}:")
    for tweet in thread_tweets:
        print(f"- @{tweet['username']}: {tweet['full_text'][:50]}...")
else:
    print(f"No tweets found for conversation {thread_conversation_id}.")

```

_See `example_get_thread.py` for the runnable script._

### 4. Get Paginated Tweets by a User

Fetching all tweets for a user can involve a large dataset. This example shows a basic way to paginate through a user's tweets.

```python
# example_get_user_tweets_paginated.py
from supabase import create_client, Client
from typing import Dict, List, Optional
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
    # ... other fields

def get_user_tweets_paginated(supabase: Client, username: str, page: int = 0, page_size: int = 100) -> List[ArchiveTweetData]:
    """
    Get paginated tweets for a specific user, ordered by creation date descending.
    Note: The 'username' field might be in a related 'accounts' table or directly on 'tweets'.
          This example assumes 'username' is directly on the 'tweets' table or a view.
          For a more robust solution, you might need to join with an 'accounts' table to get account_id from username.
    """
    offset = page * page_size
    # This query assumes you have a way to filter by username directly or an account_id if you fetch that first.
    # If 'username' is not directly on the 'tweets' table, you'd first get 'account_id' for the username.
    # For this example, let's assume a 'tweets_view' that includes username.
    response = (
        supabase.table("tweets") # Or a view like 'tweets_view_with_username'
        .select("*")
        .eq("username", username) # This line might need adjustment based on your schema
        .order("created_at", desc=True)
        .range(offset, offset + page_size - 1)
        .execute()
    )
    return response.data

# Example usage:
target_username = "example_user" # Replace with a real username
current_page = 0
page_size = 50 # Number of tweets per page

print(f"Fetching tweets for @{target_username}...")
while True:
    print(f"Fetching page {current_page}...")
    tweets_page = get_user_tweets_paginated(supabase, target_username, page=current_page, page_size=page_size)
    if not tweets_page:
        print("No more tweets found.")
        break

    for tweet in tweets_page:
        print(f"  Tweet ID: {tweet['tweet_id']}, Date: {tweet['created_at']}, Text: {tweet['full_text'][:30]}...")

    # To fetch the next page, uncomment below and remove 'break'
    # current_page += 1
    break # For this example, only fetching the first page.
```

_See `example_get_user_tweets_paginated.py` for the runnable script._

### 5. Get Top Liked Tweets for a User

This example retrieves a user's tweets and sorts them by `favorite_count` (likes) in descending order to find the most popular ones.

```python
# example_get_top_liked_tweets.py
from supabase import create_client, Client
from typing import Dict, List, Optional
from datetime import datetime

# --- Setup (replace with your actual credentials) ---
SUPABASE_URL = "YOUR_SUPABASE_URL"
SUPABASE_KEY = "YOUR_SUPABASE_KEY"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
# --- End Setup ---

class ArchiveTweetData(TypedDict):
    tweet_id: str
    username: str # Assuming username is available
    created_at: datetime
    full_text: str
    favorite_count: int
    # ... other fields

def get_top_liked_tweets_by_user(supabase: Client, username: str, limit: int = 10) -> List[ArchiveTweetData]:
    """
    Get the top N liked tweets for a specific user.
    Again, assumes 'username' is filterable on the 'tweets' table or a relevant view.
    """
    response = (
        supabase.table("tweets") # Or a view
        .select("tweet_id, username, full_text, favorite_count, created_at")
        .eq("username", username) # Adjust if filtering by account_id
        .order("favorite_count", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data

# Example usage:
target_username = "example_user" # Replace with a real username
top_n = 5
top_tweets = get_top_liked_tweets_by_user(supabase, target_username, limit=top_n)

if top_tweets:
    print(f"Top {top_n} liked tweets for @{target_username}:")
    for i, tweet in enumerate(top_tweets):
        print(f"{i+1}. Likes: {tweet['favorite_count']}, Text: {tweet['full_text'][:50]}... (ID: {tweet['tweet_id']})")
else:
    print(f"No tweets found or user @{target_username} not found.")

```

_See `example_get_top_liked_tweets.py` for the runnable script._

## Tweet Embeddings & Semantic Search

### 6. Make Tweet Embeddings

This section requires a running embedding model. The example below outlines how you might prepare text and call an embedding service. The `modal_app.py` uses an `InfinityEmbedder` class which runs a model in a Modal environment. Here's a conceptual local version using a placeholder for the actual embedding call.

_For a full, runnable example of generating embeddings with Modal, refer to the `InfinityEmbedder` class and its usage within `modal_app.py`._

```python
# example_make_embeddings_conceptual.py
import re
import numpy as np
from typing import List

# Placeholder for an actual embedding model/client
# In a real scenario, this could be SentenceTransformers, OpenAI API, etc.
# For the project's context, this would be similar to modal_app.InfinityEmbedder.embed
def conceptual_embedding_function(texts: List[str]) -> np.ndarray:
    print(f"Conceptual embedding for {len(texts)} texts. Replace with actual model.")
    # Example: return np.random.rand(len(texts), 768) # 768 is a common embedding dimension
    # For this placeholder, let's return simple fixed-size zero vectors based on text length
    # This is NOT a real embedding.
    return np.array([np.zeros(10) for _ in texts])


def clean_tweet_text_for_embedding(text: str) -> str:
    # Remove "This Post is from a suspended account. {learnmore}"
    text = re.sub(r"This Post is from a suspended account.*", "", text)
    # Remove links of the form "https://t.co/{id}"
    text = re.sub(r"https://t\.co/\w+", "", text)
    # Remove retweet prefix "RT @username:"
    text = re.sub(r"^RT @[A-Za-z0-9_]+: ", "", text)
    # Remove "@" mentions and extra whitespace at the beginning
    text = re.sub(r"^(\s*@\w+\s*)+", "", text)
    return text.strip()

# Example tweets (replace with actual tweet texts)
tweet_texts_from_db = [
    "This is the first tweet! #example",
    "Another tweet here, check out https://t.co/123abc",
    "RT @someone: Interesting thoughts on AI.",
    "@user1 @user2 What do you think about this? This is a great discussion point.",
]

# 1. Clean texts
cleaned_texts = [clean_tweet_text_for_embedding(text) for text in tweet_texts_from_db]
print("Cleaned texts for embedding:")
for i, text in enumerate(cleaned_texts):
    print(f"{i+1}. {text}")

# 2. Get embeddings (using the conceptual function)
# In a batch-oriented system, you'd send batches of texts.
# The `get_tweets.py` file's `handle_quotes` and `update_embedding_text`
# functions show how "emb_text" is constructed, often including context.
# For this simple example, we use just the cleaned full_text.

tweet_embeddings = conceptual_embedding_function(cleaned_texts)

print(f"\nGenerated embeddings (shape: {tweet_embeddings.shape}):")
# print(tweet_embeddings) # This would print the actual embedding vectors

# Further steps would involve storing these embeddings alongside tweet IDs.
# For example, in a NumPy array, a database, or a vector store.
# np.save("tweet_embeddings.npy", tweet_embeddings)
# tweet_ids = ["id1", "id2", "id3", "id4"] # Corresponding IDs

```

_See `example_make_embeddings_conceptual.py` for a conceptual script. Refer to `modal_app.py` for a production-grade embedding pipeline._

### 7. Run Semantic Search (Dot Product)

Once you have embeddings, you can perform semantic search. This example uses the dot product to find tweets semantically similar to a query.

```python
# example_semantic_search.py
import numpy as np
from typing import List, Tuple

# Assume:
# 1. `tweet_embeddings.npy` exists and contains embeddings for tweets.
# 2. `tweet_ids_and_texts.json` exists with a list of [id, text] for corresponding embeddings.
#    (You'd create these from your database and embedding generation step)
# 3. `conceptual_embedding_function` is available to embed the search query.

# Placeholder for an actual embedding model/client (same as above)
def conceptual_embedding_function(texts: List[str]) -> np.ndarray:
    # print(f"Conceptual embedding for {len(texts)} texts. Replace with actual model.")
    # Example: return np.random.rand(len(texts), 768)
    # For this placeholder, let's return a simple fixed-size zero vector
    # This is NOT a real embedding.
    if texts:
        return np.random.rand(len(texts), 10) # Ensure consistent dimension with stored embeddings
    return np.array([])


# --- Create dummy data for the example to run ---
def create_dummy_data():
    dummy_embeddings = np.random.rand(5, 10) # 5 tweets, 10 dimensions
    dummy_data = [
        {"id": "tweet1", "text": "Exploring the future of artificial intelligence."},
        {"id": "tweet2", "text": "A discussion on renewable energy sources."},
        {"id": "tweet3", "text": "Deep learning models are becoming more powerful."},
        {"id": "tweet4", "text": "Solar power is a great alternative energy."},
        {"id": "tweet5", "text": "The ethics of AI development and deployment."}
    ]
    np.save("tweet_embeddings.npy", dummy_embeddings)
    import json
    with open("tweet_ids_and_texts.json", "w") as f:
        json.dump(dummy_data, f)
create_dummy_data()
# --- End dummy data creation ---


def semantic_search_dot_product(
    query: str,
    all_embeddings: np.ndarray,
    tweet_data: List[Dict[str,str]], # List of {"id": str, "text": str}
    embedding_function: callable,
    top_n: int = 3
) -> List[Tuple[str, str, float]]:
    """
    Performs semantic search using dot product.
    """
    query_embedding = embedding_function([query])[0] # Get embedding for the single query

    # Normalize embeddings (optional, but good for cosine similarity via dot product)
    # query_embedding_norm = query_embedding / np.linalg.norm(query_embedding)
    # all_embeddings_norm = all_embeddings / np.linalg.norm(all_embeddings, axis=1, keepdims=True)
    # For simplicity, we'll use direct dot product here. For true cosine similarity, normalize.

    # Calculate dot product (similarity scores)
    similarities = np.dot(all_embeddings, query_embedding)

    # Get top N results
    # Argsort returns indices that would sort the array. We want descending order.
    top_indices = np.argsort(similarities)[::-1][:top_n]

    results = []
    for i in top_indices:
        results.append((tweet_data[i]["id"], tweet_data[i]["text"], float(similarities[i])))
    return results

# Load pre-computed embeddings and corresponding tweet texts/IDs
try:
    all_tweet_embeddings = np.load("tweet_embeddings.npy")
    import json
    with open("tweet_ids_and_texts.json", "r") as f:
        tweet_ids_and_texts_data = json.load(f)
except FileNotFoundError:
    print("Dummy data files not found. Please run the script that creates them or provide real data.")
    exit()


search_query = "AI and its impact"
print(f"Searching for: '{search_query}'")

search_results = semantic_search_dot_product(
    query=search_query,
    all_embeddings=all_tweet_embeddings,
    tweet_data=tweet_ids_and_texts_data,
    embedding_function=conceptual_embedding_function,
    top_n=3
)

print("\nTop search results:")
for tweet_id, text, score in search_results:
    print(f"  ID: {tweet_id}, Score: {score:.4f}, Text: {text}")

# Clean up dummy files
import os
os.remove("tweet_embeddings.npy")
os.remove("tweet_ids_and_texts.json")
```

_See `example_semantic_search.py` for the runnable script._

## Tweet Clustering

### 8. Cluster Tweet Embeddings

After generating embeddings, you can cluster them to find groups of semantically similar tweets. This example outlines the conceptual steps. The `modal_app.py` file contains a more complete implementation using `cuml.cluster.hdbscan` on a GPU.

_For a full, runnable example of clustering with Modal and RAPIDS, refer to the `cluster_tweet_embeddings` and `reduce_dimensions` functions in `modal_app.py` and the `find_optimal_clustering_params` function in `lib/cluster.py`._

```python
# example_cluster_tweets_conceptual.py
import numpy as np
import pandas as pd
# from sklearn.cluster import HDBSCAN # CPU version, for conceptual example
# For GPU version as in project: import cuml

# Assume `tweet_embeddings.npy` exists from the embedding step.

# --- Create dummy data for the example to run ---
def create_dummy_embeddings_for_clustering():
    # Create embeddings that might form a few clusters
    cluster1 = np.random.rand(20, 10) + np.array([1,1,0,0,0,0,0,0,0,0]) # 20 tweets, 10 dimensions
    cluster2 = np.random.rand(20, 10) + np.array([0,0,1,1,0,0,0,0,0,0])
    noise = np.random.rand(10, 10) + np.array([0,0,0,0,1,1,0,0,0,0])
    dummy_embeddings = np.vstack([cluster1, cluster2, noise])
    np.save("tweet_embeddings_for_clustering.npy", dummy_embeddings)
    # Corresponding dummy tweet IDs
    tweet_ids = [f"tweet_{i}" for i in range(dummy_embeddings.shape[0])]
    return tweet_ids

tweet_ids = create_dummy_embeddings_for_clustering()
# --- End dummy data creation ---

try:
    embeddings = np.load("tweet_embeddings_for_clustering.npy")
except FileNotFoundError:
    print("tweet_embeddings_for_clustering.npy not found. Create dummy data or provide real embeddings.")
    exit()

print(f"Loaded embeddings of shape: {embeddings.shape}")

# Step 1: Dimensionality Reduction (Optional, but often recommended for HDBSCAN)
# The project uses UMAP: cuml.manifold.UMAP
# For this conceptual CPU example, we might skip or use PCA from sklearn
# from sklearn.decomposition import PCA
# n_components_umap = 5 # As in project
# reduced_embeddings = PCA(n_components=n_components_umap).fit_transform(embeddings)
# print(f"Reduced embeddings shape: {reduced_embeddings.shape}")
# For simplicity, we'll use the original embeddings in this conceptual example.
reduced_embeddings = embeddings # In practice, use UMAP

# Step 2: Clustering (HDBSCAN)
# The project uses cuml.cluster.hdbscan.HDBSCAN and find_optimal_clustering_params
# Here's a conceptual sklearn version:
from sklearn.cluster import HDBSCAN # Using sklearn for a simple CPU example
# Optimal parameters (min_cluster_size, min_samples) are crucial.
# The `find_optimal_clustering_params` in `lib/cluster.py` does this.
# For this example, we use some arbitrary defaults.
clusterer = HDBSCAN(min_cluster_size=5, min_samples=2, metric='euclidean', gen_min_span_tree=True)
# clusterer = cuml.cluster.hdbscan.HDBSCAN(...) # if using RAPIDS

cluster_labels = clusterer.fit_predict(reduced_embeddings)

# Results
num_clusters = len(set(cluster_labels)) - (1 if -1 in cluster_labels else 0)
num_noise = np.sum(np.array(cluster_labels) == -1)

print(f"\nClustering results:")
print(f"  Number of clusters found: {num_clusters}")
print(f"  Number of noise points: {num_noise}")

# You would typically store these cluster_labels alongside your tweet_ids
# For example, in a DataFrame:
# results_df = pd.DataFrame({'tweet_id': tweet_ids, 'cluster_label': cluster_labels})
# print("\nSample of clustering results:")
# print(results_df.head())

# print("\nTweets per cluster:")
# print(results_df['cluster_label'].value_counts())

# Clean up dummy file
import os
os.remove("tweet_embeddings_for_clustering.npy")

```

_See `example_cluster_tweets_conceptual.py` for the conceptual script. Refer to `modal_app.py` and `lib/cluster.py` for production-grade clustering._

## Advanced Processing

### 9. Building Conversation Trees

The `get_tweets.py` script includes logic to build conversation trees from a list of tweets that are part of a conversation. This involves identifying root tweets, replies, and constructing parent-child relationships.

_Refer to the `build_conversation_trees` function in `community-archive-personal/src/modal_app/lib/get_tweets.py` for the detailed implementation._ The function takes a list of tweet objects (each including `conversation_id`, `tweet_id`, `reply_to_tweet_id`) and organizes them into a dictionary of trees.

### 10. Handling Quoted Tweets

The system can identify and fetch quoted tweets. This involves:

1. Identifying tweets that quote other tweets (e.g., via URL patterns or specific fields).
2. Fetching these quoted tweets from the database (or liked tweets if not found).
3. Integrating this information, for example, by adding `quoted_tweet_id` to the main tweet data or enriching `emb_text`.

_Refer to the `handle_quotes` function in `community-archive-personal/src/modal_app/lib/get_tweets.py`._

### 11. Labeling Tweet Clusters with LLMs

After clustering, the `modal_app.py` script uses Large Language Models (LLMs) to generate descriptive labels (name, summary) for each cluster.

This involves:

1. Preparing a representative sample of tweets or tweet text from each cluster.
2. Formatting this information into a prompt for an LLM.
3. Calling an LLM API (e.g., via OpenRouter as shown in `utils/openrouter_client.py` and `modal_app.label_one_cluster`).
4. Parsing the LLM's response to extract the labels.

_See the `label_one_cluster` function and its usage within the `orchestrator` in `community-archive-personal/src/modal_app/modal_app.py`, and the prompt construction in `make_cluster_str` from `lib/ontological_label_lib.py`._

---

This list provides a starting point. The birdseye codebase contains more sophisticated logic for handling various aspects of Twitter data.
