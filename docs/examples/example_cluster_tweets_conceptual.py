import numpy as np
import pandas as pd  # Not used in current script but often useful with clustering results
import os  # Added os

# from sklearn.cluster import HDBSCAN # CPU version, for conceptual example
# For GPU version as in project: import cuml

# Assume `tweet_embeddings.npy` exists from the embedding step.


# --- Create dummy data for the example to run ---
def create_dummy_embeddings_for_clustering():
    # Create embeddings that might form a few clusters
    cluster1 = np.random.rand(20, 10) + np.array(
        [1, 1, 0, 0, 0, 0, 0, 0, 0, 0]
    )  # 20 tweets, 10 dimensions
    cluster2 = np.random.rand(20, 10) + np.array([0, 0, 1, 1, 0, 0, 0, 0, 0, 0])
    noise = np.random.rand(10, 10) + np.array([0, 0, 0, 0, 1, 1, 0, 0, 0, 0])
    dummy_embeddings = np.vstack([cluster1, cluster2, noise])
    np.save("tweet_embeddings_for_clustering.npy", dummy_embeddings)
    # Corresponding dummy tweet IDs (not used in this script directly, but for context)
    tweet_ids = [f"tweet_{i}" for i in range(dummy_embeddings.shape[0])]
    return tweet_ids


# --- End dummy data creation ---

# Example usage
if __name__ == "__main__":
    tweet_ids = create_dummy_embeddings_for_clustering()

    try:
        embeddings = np.load("tweet_embeddings_for_clustering.npy")
    except FileNotFoundError:
        print(
            "tweet_embeddings_for_clustering.npy not found. Create dummy data or provide real embeddings."
        )
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
    reduced_embeddings = embeddings  # In practice, use UMAP

    # Step 2: Clustering (HDBSCAN)
    # The project uses cuml.cluster.hdbscan.HDBSCAN and find_optimal_clustering_params
    # Here's a conceptual sklearn version:
    try:
        from sklearn.cluster import HDBSCAN  # Using sklearn for a simple CPU example
    except ImportError:
        print("sklearn.cluster.HDBSCAN not found. Please install scikit-learn.")
        print("pip install scikit-learn")
        # Clean up dummy file if scikit-learn is not available to prevent errors on next run
        if os.path.exists("tweet_embeddings_for_clustering.npy"):
            os.remove("tweet_embeddings_for_clustering.npy")
        exit()

    # Optimal parameters (min_cluster_size, min_samples) are crucial.
    # The `find_optimal_clustering_params` in `lib/cluster.py` does this.
    # For this example, we use some arbitrary defaults.
    clusterer = HDBSCAN(
        min_cluster_size=5, min_samples=2, metric="euclidean", gen_min_span_tree=True
    )
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
    results_df = pd.DataFrame(
        {"tweet_id": tweet_ids[: len(cluster_labels)], "cluster_label": cluster_labels}
    )
    print("\nSample of clustering results:")
    print(results_df.head())

    print("\nTweets per cluster:")
    print(results_df["cluster_label"].value_counts())

    # Clean up dummy file
    if os.path.exists("tweet_embeddings_for_clustering.npy"):
        os.remove("tweet_embeddings_for_clustering.npy")
