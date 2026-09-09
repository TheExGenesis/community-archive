"""Focused integration checks against a disposable PostgreSQL database."""
import datetime as dt
from decimal import Decimal
import json
import os
from pathlib import Path
import types
import unittest
from unittest.mock import patch

import psycopg
from psycopg.rows import dict_row

import after_autorefresh
import worker
from labels import SYSTEM

ROOT=Path(__file__).resolve().parents[2]
FIXTURE='''
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE SCHEMA tes;
CREATE TABLE public.all_account(account_id text PRIMARY KEY,username text,is_tombstone boolean DEFAULT false);
CREATE TABLE public.members(account_id text PRIMARY KEY);
CREATE VIEW public.user_directory AS SELECT account_id FROM public.members;
CREATE TABLE public.optin(twitter_user_id text,username text,explicit_optout boolean);
CREATE TABLE tes.blocked_scraping_users(account_id text,username text);
CREATE TABLE public.tweets(tweet_id text PRIMARY KEY,account_id text,full_text text,
  created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
  is_tombstone boolean DEFAULT false,reply_to_tweet_id text);
CREATE TABLE public.retweets(tweet_id text);
CREATE TABLE public.followers(account_id text,follower_account_id text);
CREATE TABLE public.following(account_id text,following_account_id text);
GRANT USAGE ON SCHEMA public,tes TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public,tes TO service_role;
'''


class WrapperTests(unittest.TestCase):
    def test_downstream_runs_only_after_success(self):
        calls=[]
        def invoke(cmd,**kwargs):
            calls.append(cmd)
            return types.SimpleNamespace(returncode=1)
        self.assertEqual(after_autorefresh.run(Path('/pipeline'),invoke),1)
        self.assertEqual(len(calls),1)
        calls.clear()
        def success(cmd,**kwargs):
            calls.append(cmd)
            return types.SimpleNamespace(returncode=0)
        self.assertEqual(after_autorefresh.run(Path('/pipeline'),success),0)
        self.assertEqual(calls[-1],['systemctl','start','ca-bulletin.service'])
