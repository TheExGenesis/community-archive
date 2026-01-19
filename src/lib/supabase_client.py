"""Supabase client utilities for community archive database."""
import os
from typing import TypedDict
import httpx


class Tweet(TypedDict):
  tweet_id: str
  full_text: str


class MediaRow(TypedDict):
  media_url: str


def _get_supabase_config() -> tuple[str, str]:
  url = os.environ.get(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://fabxmporizzqflnftavs.supabase.co"
  )
  key = os.environ.get(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8"
  )
  return url, key


def _headers() -> dict[str, str]:
  _, key = _get_supabase_config()
  return {"apikey": key, "Authorization": f"Bearer {key}"}


def fetch_tweet(tweet_id: str) -> Tweet | None:
  """Fetch tweet by ID from Supabase."""
  url, _ = _get_supabase_config()
  endpoint = f"{url}/rest/v1/tweets?tweet_id=eq.{tweet_id}&select=tweet_id,full_text"
  resp = httpx.get(endpoint, headers=_headers())
  resp.raise_for_status()
  rows = resp.json()
  return rows[0] if rows else None


def fetch_tweets(tweet_ids: list[str]) -> dict[str, Tweet]:
  """Fetch tweets by IDs from Supabase."""
  url, _ = _get_supabase_config()
  endpoint = f"{url}/rest/v1/tweets?tweet_id=in.({','.join(tweet_ids)})&select=tweet_id,full_text"
  resp = httpx.get(endpoint, headers=_headers())
  resp.raise_for_status()
  return {row["tweet_id"]: row for row in resp.json()}

def fetch_tweet_media(tweet_id: str) -> list[MediaRow]:
  """Fetch photo media for a tweet from Supabase."""
  url, _ = _get_supabase_config()
  endpoint = f"{url}/rest/v1/tweet_media?tweet_id=eq.{tweet_id}&media_type=eq.photo&select=media_url"
  resp = httpx.get(endpoint, headers=_headers())
  resp.raise_for_status()
  return resp.json()
