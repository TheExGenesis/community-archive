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
dotenv_path = os.path.join(project_root, "community-archive", ".env")
load_dotenv(dotenv_path)

# Initialize Supabase client
supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.getenv("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE")
if not supabase_url or not supabase_key:
    raise ValueError(
        "Supabase URL or Service Role Key not found in environment variables."
    )
supabase: Client = create_client(supabase_url, supabase_key)

# Upload the modified archives to Supabase Storage
BUCKET_NAME = "archives"
OUTPUT_DIR = os.path.join(
    project_root, "data/circle-mitigation/archives-no-circle-tweets"
)

print(f"Uploading modified archives from {OUTPUT_DIR} to bucket {BUCKET_NAME}")

if not os.path.isdir(OUTPUT_DIR):
    raise FileNotFoundError(f"Output directory not found: {OUTPUT_DIR}")

# Get user directories and find archive files
files_to_upload = []
for username in os.listdir(OUTPUT_DIR):
    user_dir = os.path.join(OUTPUT_DIR, username)
    if os.path.isdir(user_dir):
        archive_path = os.path.join(user_dir, "archive.json")
        if os.path.exists(archive_path):
            files_to_upload.append((username, archive_path))

print(f"Found {len(files_to_upload)} archive files to upload")
if files_to_upload:
    print(f"First 5 usernames: {[username for username, _ in files_to_upload[:5]]}")
# files_to_upload = ["exgenesis/archive.json"]  # Example: process only exgenesis.json

# %%

for username, file_path in tqdm.tqdm(files_to_upload):
    # Assuming filenames are like '<user_id>.json' or '<username>.json'.
    # Extract the identifier (user_id or username) from the filename without the extension.
    destination_path = f"{username}/archive.json"

    try:
        with open(file_path, "rb") as f:  # Open in binary mode for upload
            res = supabase.storage.from_(BUCKET_NAME).upload(
                path=destination_path,
                file=f,
                file_options={"content-type": "application/json", "upsert": "true"},
            )
        print(f"Successfully uploaded {username} to {destination_path}")
    except Exception as e:
        print(f"Failed to upload {username}: {e}")

print("Finished uploading modified archives.")
