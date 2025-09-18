# cron job that checks whether there are new archives in supabase storage since the last time it ran, and if not, just print what the latest 5 were. If yes, check if those archives already exist in the archive_uploads table
import modal
import os
from datetime import datetime, timezone
from supabase import create_client, Client

# Modal App Configuration
stub = modal.App(name="archive-watcher")
image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "supabase", "python-dotenv"  # For local testing if SUPABASE_URL/KEY are in .env
)

# Persistent volume for storing the last run timestamp
volume = modal.Volume.from_name("archive-watcher-data", create_if_missing=True)
LAST_RUN_TS_PATH = "/data/last_run.txt"
BUCKET_NAME = "archives"  # Default bucket name, can be overridden by secret


# Helper to get Supabase client using Modal Secrets
def get_supabase_client() -> Client:
    # In Modal, SUPABASE_URL and SUPABASE_KEY should be set as secrets
    # For local testing, they can be in .env file loaded by python-dotenv
    # or set as environment variables directly.
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")

    if not url or not key:
        # This check is more for local execution.
        # In Modal, if secrets are not found, it would typically fail earlier.
        print(
            "Warning: SUPABASE_URL or SUPABASE_KEY not found in environment. Using placeholders for local dev if any."
        )
        # Fallback for local execution without .env, expecting placeholders or direct env vars
        # These default values are just for the code to be syntactically valid if run locally without setup.
        # They will not work. Real credentials must be provided via Modal secrets or environment.
        if os.environ.get("MODAL_ENVIRONMENT"):  # Check if running in Modal
            raise ValueError(
                "SUPABASE_URL and SUPABASE_KEY must be set in Modal secrets (e.g., 'supabase-credentials')."
            )
        url = url or "http://localhost:54321"
        key = key or "your-anon-key"

    return create_client(url, key)


# Helper to parse ISO timestamp strings from Supabase into datetime objects
def parse_iso_timestamp(ts_str: str) -> datetime:
    if not ts_str:
        # Handle cases where a timestamp might be None or empty
        return datetime.min.replace(tzinfo=timezone.utc)  # Return a very old date
    return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))


def get_last_run_timestamp() -> datetime:
    try:
        with open(LAST_RUN_TS_PATH, "r") as f:
            last_run_ts_str = f.read().strip()
        last_run_ts = parse_iso_timestamp(last_run_ts_str)
        print(f"Last run: {last_run_ts.isoformat()}")
        return last_run_ts
    except FileNotFoundError:
        print("No last run timestamp found, using epoch")
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    except Exception as e:
        print(f"Error reading timestamp: {e}, using epoch")
        return datetime(1970, 1, 1, tzinfo=timezone.utc)


def save_timestamp(timestamp: datetime):
    with open(LAST_RUN_TS_PATH, "w") as f:
        f.write(timestamp.isoformat())
    volume.commit()


def get_archive_files(supabase: Client) -> list:
    root_items = supabase.storage.from_(BUCKET_NAME).list()
    if not root_items:
        return []

    archive_files = []
    for item in root_items:
        folder_name = item.get("name")

        # Check if it's a folder (heuristic: no ID and no extension)
        if folder_name and item.get("id") is None and "." not in folder_name:
            try:
                folder_contents = supabase.storage.from_(BUCKET_NAME).list(
                    path=folder_name
                )
                for file_obj in folder_contents:
                    if file_obj.get("name") == "archive.json" and file_obj.get(
                        "updated_at"
                    ):
                        archive_files.append(
                            {
                                "full_path": f"{folder_name}/archive.json",
                                "username": folder_name,
                                "updated_at": file_obj["updated_at"],
                                "created_at": file_obj.get("created_at"),
                                "id": file_obj.get("id"),
                            }
                        )
                        break
            except Exception as e:
                print(f"Warning: Could not list '{folder_name}': {e}")

        # Direct file case
        elif (
            folder_name
            and folder_name.endswith("/archive.json")
            and item.get("updated_at")
            and item.get("id")
        ):
            archive_files.append(
                {
                    "full_path": folder_name,
                    "username": folder_name.split("/")[0],
                    "updated_at": item["updated_at"],
                    "created_at": item.get("created_at"),
                    "id": item.get("id"),
                }
            )

    return archive_files


def process_new_archive(supabase: Client, archive_info: dict, last_run_ts: datetime):
    username = archive_info["username"]
    print(f"Processing: {archive_info['full_path']} (User: {username})")

    try:
        # Get account_id
        acc_resp = (
            supabase.table("all_account")
            .select("account_id")
            .eq("username", username)
            .single()
            .execute()
        )

        if not acc_resp.data or not acc_resp.data.get("account_id"):
            if acc_resp.error:
                print(f"  Error fetching account_id: {acc_resp.error.message}")
            else:
                print(f"  No account_id found for {username}")
            return

        account_id = acc_resp.data["account_id"]

        # Check latest archive_upload entry
        upload_resp = (
            supabase.table("archive_upload")
            .select("id, archive_at, created_at, upload_phase")
            .eq("account_id", account_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if upload_resp.data:
            entry = upload_resp.data[0]
            print(f"  Latest entry: ID={entry['id']}, Phase='{entry['upload_phase']}'")

            db_created_at = parse_iso_timestamp(entry["created_at"])
            if db_created_at > last_run_ts:
                print(f"  Archive processed after last check")
            else:
                print(f"  Archive may need processing (DB entry older than last check)")
        else:
            print(f"  No archive_upload entries for {username}")

    except Exception as e:
        print(f"  Database error for {username}: {e}")


@stub.function(
    image=image,
    secrets=[
        # Ensure you have a Modal Secret named "supabase-credentials"
        # with keys SUPABASE_URL and SUPABASE_KEY
        modal.Secret.from_name("supabase-creds")
    ],
    schedule=modal.Cron("0 */1 * * *"),  # Run every hour at minute 0
    volumes={"/data": volume},
    timeout=600,  # 10 minutes
)
def check_new_archives():
    print(f"Starting archive check at {datetime.now(timezone.utc).isoformat()}")

    supabase = get_supabase_client()
    now_utc = datetime.now(timezone.utc)
    last_run_ts = get_last_run_timestamp()

    try:
        archive_files = get_archive_files(supabase)

        if not archive_files:
            print(f"No items found in bucket '{BUCKET_NAME}'")
            save_timestamp(now_utc)
            return

        # Filter for newly updated files
        new_archives = [
            f
            for f in archive_files
            if parse_iso_timestamp(f["updated_at"]) > last_run_ts
        ]

        if not new_archives:
            print(f"No new archives since {last_run_ts.isoformat()}")
            print("Latest 5 archives:")
            sorted_files = sorted(
                archive_files,
                key=lambda x: parse_iso_timestamp(x["updated_at"]),
                reverse=True,
            )
            for f in sorted_files[:5]:
                print(f"- {f['full_path']} (Updated: {f['updated_at']})")
        else:
            print(f"Found {len(new_archives)} new/updated archives:")
            for archive_info in new_archives:
                process_new_archive(supabase, archive_info, last_run_ts)

        save_timestamp(now_utc)
        print(f"Check completed at {now_utc.isoformat()}")

    except Exception as e:
        print(f"Error during archive check: {e}")
        import traceback

        traceback.print_exc()


# For local testing:
# You can run this with `modal run storage_to_db_insert.py`
# Ensure you have a .env file with SUPABASE_URL and SUPABASE_KEY for local Supabase client,
# or set them as environment variables. Modal secrets are used when deployed.
@stub.local_entrypoint()
def main():
    # Ensure .env is loaded if present (for local testing)
    from dotenv import load_dotenv

    load_dotenv()
    print("Running local test...")
    check_new_archives.remote()
    print("Local test finished.")
