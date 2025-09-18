import numpy as np
from typing import List, Tuple, Dict, Callable  # Added Dict, Callable
import json  # Added json
import os  # Added os

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
        return np.random.rand(
            len(texts), 10
        )  # Ensure consistent dimension with stored embeddings
    return np.array([])


# --- Create dummy data for the example to run ---
def create_dummy_data():
    dummy_embeddings = np.random.rand(5, 10)  # 5 tweets, 10 dimensions
    dummy_data = [
        {"id": "tweet1", "text": "Exploring the future of artificial intelligence."},
        {"id": "tweet2", "text": "A discussion on renewable energy sources."},
        {"id": "tweet3", "text": "Deep learning models are becoming more powerful."},
        {"id": "tweet4", "text": "Solar power is a great alternative energy."},
        {"id": "tweet5", "text": "The ethics of AI development and deployment."},
    ]
    np.save("tweet_embeddings.npy", dummy_embeddings)
    with open("tweet_ids_and_texts.json", "w") as f:
        json.dump(dummy_data, f)


# --- End dummy data creation ---


def semantic_search_dot_product(
    query: str,
    all_embeddings: np.ndarray,
    tweet_data: List[Dict[str, str]],  # List of {"id": str, "text": str}
    embedding_function: Callable[
        [List[str]], np.ndarray
    ],  # Specified Callable signature
    top_n: int = 3,
) -> List[Tuple[str, str, float]]:
    """
    Performs semantic search using dot product.
    """
    if all_embeddings.size == 0:
        return []

    query_embedding_array = embedding_function([query])
    if query_embedding_array.size == 0:
        return []
    query_embedding = query_embedding_array[0]

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
        results.append(
            (tweet_data[i]["id"], tweet_data[i]["text"], float(similarities[i]))
        )
    return results


# Example usage
if __name__ == "__main__":
    create_dummy_data()

    # Load pre-computed embeddings and corresponding tweet texts/IDs
    try:
        all_tweet_embeddings = np.load("tweet_embeddings.npy")
        with open("tweet_ids_and_texts.json", "r") as f:
            tweet_ids_and_texts_data = json.load(f)
    except FileNotFoundError:
        print(
            "Dummy data files not found. Please run the script that creates them or provide real data."
        )
        exit()

    search_query = "AI and its impact"
    print(f"Searching for: '{search_query}'")

    search_results = semantic_search_dot_product(
        query=search_query,
        all_embeddings=all_tweet_embeddings,
        tweet_data=tweet_ids_and_texts_data,
        embedding_function=conceptual_embedding_function,
        top_n=3,
    )

    print("\nTop search results:")
    for tweet_id, text, score in search_results:
        print(f"  ID: {tweet_id}, Score: {score:.4f}, Text: {text}")

    # Clean up dummy files
    os.remove("tweet_embeddings.npy")
    os.remove("tweet_ids_and_texts.json")
