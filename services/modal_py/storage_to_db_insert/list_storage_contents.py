import os
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime


def main():
    """
    Connects to Supabase and lists the contents of the 'archives' storage bucket.
    """
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")  # Use anon key or service role key

    if not supabase_url or not supabase_key:
        print(
            "Error: SUPABASE_URL and SUPABASE_KEY must be set in your .env file or environment."
        )
        return

    try:
        supabase: Client = create_client(supabase_url, supabase_key)
        print(f"Successfully connected to Supabase at {supabase_url}")
    except Exception as e:
        print(f"Error connecting to Supabase: {e}")
        return

    bucket_name = "archives"

    try:
        print(f"\nListing contents of bucket: '{bucket_name}'...")
        # The list() method without a path lists from the root of the bucket.
        # It can accept options like limit, offset, sortBy.
        # sortBy can be e.g. { "column": "updated_at", "order": "desc" }
        objects = supabase.storage.from_(bucket_name).list()

        if objects:
            print(f"Found {len(objects)} items:")
            for obj in objects:
                name = obj.get("name")
                obj_id = obj.get("id")  # id is often the full path for files
                updated_at_str = obj.get("updated_at")
                created_at_str = obj.get("created_at")
                last_accessed_at_str = obj.get("last_accessed_at")

                updated_at_dt = (
                    datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
                    if updated_at_str
                    else "N/A"
                )

                print(f"  - Name: {name}")
                print(f"    ID (Path): {obj_id}")
                if isinstance(updated_at_dt, datetime):
                    print(
                        f"    Updated At: {updated_at_dt.strftime('%Y-%m-%d %H:%M:%S %Z')}"
                    )
                else:
                    print(f"    Updated At: {updated_at_str}")
                print(f"    Created At: {created_at_str}")
                print(f"    Last Accessed At: {last_accessed_at_str}")
                print(
                    f"    Metadata: {obj.get('metadata')}"
                )  # Includes size, mimetype etc.
                print("-" * 20)

        else:
            print(f"No objects found in bucket '{bucket_name}' or bucket is empty.")

    except Exception as e:
        print(f"Error listing objects from bucket '{bucket_name}': {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()
