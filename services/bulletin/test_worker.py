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
    def test_cron_wrapper_starts_bulletin_after_autorefresh_completes(self):
        start=['systemctl','start','--no-block','ca-bulletin.service']
        for pipeline_code in (1,0):
            calls=[]
            def invoke(cmd,**kwargs):
                calls.append(cmd)
                # A Bulletin start failure must not mask the pipeline result.
                return types.SimpleNamespace(returncode=5 if cmd[0]=='systemctl' else pipeline_code)
            self.assertEqual(after_autorefresh.run(Path('/pipeline'),invoke),pipeline_code)
            self.assertEqual(calls[0][-1],'/pipeline/run_pipeline.py')
            self.assertEqual(calls[1:],[start])
