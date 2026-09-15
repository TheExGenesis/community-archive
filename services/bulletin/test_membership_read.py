"""Membership parity against the canonical directory in a named local test DB."""
import os
from pathlib import Path
import re
import unittest

import psycopg

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = '''
CREATE SCHEMA bulletin;
CREATE SCHEMA tes;
CREATE TYPE public.upload_phase_enum AS ENUM ('uploading','completed');
CREATE TABLE public.all_account (
 account_id text PRIMARY KEY, username text, is_tombstone boolean DEFAULT false,
 created_via text, created_at timestamptz, account_display_name text,
 num_tweets int, num_following int, num_followers int, num_likes int);
CREATE TABLE public.archive_upload (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, account_id text,
 upload_phase public.upload_phase_enum, created_at timestamptz DEFAULT now(), archive_at timestamptz);
CREATE TABLE public.all_profile (
 account_id text, bio text, website text, location text, avatar_media_url text,
 header_media_url text, archive_upload_id bigint);
CREATE TABLE public.optin (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, twitter_user_id text,
 username text, opted_in boolean, explicit_optout boolean,
 opted_in_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz);
CREATE TABLE tes.blocked_scraping_users(account_id text,username text);
'''
BASELINE = '''
SELECT DISTINCT a.account_id,a.username
FROM public.user_directory d JOIN public.all_account a USING(account_id)
WHERE NOT a.is_tombstone
 AND NOT EXISTS (SELECT 1 FROM public.optin o WHERE o.explicit_optout IS TRUE
  AND (o.twitter_user_id=a.account_id OR lower(ltrim(o.username,'@'))=lower(a.username)))
 AND NOT EXISTS (SELECT 1 FROM tes.blocked_scraping_users b
  WHERE b.account_id=a.account_id OR lower(ltrim(b.username,'@'))=lower(a.username))
'''


class MembershipTests(unittest.TestCase):
    def setUp(self):
        self.db = psycopg.connect(os.environ['BULLETIN_MEMBERSHIP_TEST_DSN'])
        if self.db.info.host != '127.0.0.1' or self.db.info.dbname != 'bulletin_membership_test':
            self.db.close()
            raise RuntimeError('Requires the named disposable loopback database')
        self.addCleanup(self.db.close)  # Roll back the entire fixture.
        self.db.execute(FIXTURE)
        directory = (ROOT/'supabase/schemas/040_views.sql').read_text().split('-- public.user_directory\n')[1].split('-- Private Bulletin')[0]
        prereq = (ROOT/'supabase/schemas/032_views_prereq.sql').read_text()
        # Local PostgreSQL 14 lacks the PG15 view option; membership SQL is
        # unchanged. The migration itself never changes privileges/options.
        for source in (prereq, directory):
            source = source.replace(' WITH (security_invoker = true)', '')
            source = re.sub(r'ALTER TABLE .*? OWNER TO "postgres";', '', source)
            self.db.execute(source)
        self.db.execute('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role')
        self.db.execute('CREATE VIEW bulletin.allowed_accounts AS '+BASELINE)
        self.db.execute('GRANT USAGE ON SCHEMA bulletin TO service_role; GRANT SELECT ON bulletin.allowed_accounts TO service_role')
        self.db.execute(next((ROOT/'supabase/migrations').glob('*_bulletin_membership_read.sql')).read_text())

    def account(self, ident, *, archive=None, optin=None, username=None, tombstone=False):
        name = username or ident
        self.db.execute('INSERT INTO all_account(account_id,username,is_tombstone) VALUES(%s,%s,%s)', (ident,name,tombstone))
        if archive:
            self.db.execute('INSERT INTO archive_upload(account_id,upload_phase) VALUES(%s,%s)',(ident,archive))
        if optin is not None:
            self.db.execute('INSERT INTO optin(twitter_user_id,username,opted_in) VALUES(%s,%s,%s)',(ident,name,optin))

    def members(self):
        current = self.db.execute('SELECT account_id,username FROM bulletin.allowed_accounts ORDER BY account_id').fetchall()
        self.assertEqual(current, self.db.execute(BASELINE+' ORDER BY a.account_id').fetchall())
        return [row[0] for row in current]

    def test_archive_and_optin_membership_with_all_exclusions(self):
        self.account('archive', archive='completed')
        self.account('pending', archive='uploading')
        self.account('optin', optin=True)
        self.account('false', optin=False)
        self.account('nonmember')
        self.account('tombstone', optin=True, tombstone=True)
        self.account('id-optout', archive='completed')
        self.account('name-optout', optin=True)
        self.account('id-block', optin=True)
        self.account('name-block', archive='completed')
        self.account('username-only')
        self.account('old-handle', optin=True)
        self.db.execute("INSERT INTO optin(twitter_user_id,username,explicit_optout) VALUES ('id-optout','alias',true),(NULL,'@@NAME-OPTOUT',true),(NULL,'previous-handle',true)")
        self.db.execute("UPDATE optin SET username='previous-handle' WHERE twitter_user_id='old-handle'")
        self.db.execute("INSERT INTO optin(username,opted_in) VALUES ('username-only',true)")
        self.db.execute("INSERT INTO tes.blocked_scraping_users VALUES ('id-block',NULL),(NULL,'@NAME-BLOCK')")
        self.assertEqual(self.members(), ['archive','optin'])

    def test_duplicate_archive_optins_and_live_policy_changes(self):
        self.account('a', archive='completed', optin=True, username='same')
        self.account('b', optin=True, username='second')
        self.db.execute("UPDATE optin SET username='same' WHERE twitter_user_id='b'")
        self.db.execute("INSERT INTO archive_upload(account_id,upload_phase) VALUES ('a','completed')")
        self.assertEqual(self.members(), ['a'])  # Match canonical alias deduplication.
        self.db.execute("UPDATE optin SET username='second' WHERE twitter_user_id='b'")
        self.assertEqual(self.members(), ['a','b'])
        self.db.execute("INSERT INTO optin(twitter_user_id,explicit_optout) VALUES ('a',true)")
        self.assertEqual(self.members(), ['b'])
        self.db.execute("INSERT INTO tes.blocked_scraping_users(account_id) VALUES ('b')")
        self.assertEqual(self.members(), [])

    def test_replacing_view_preserves_private_grants(self):
        for role, expected in [('anon',False),('authenticated',False),('service_role',True)]:
            allowed = self.db.execute("SELECT has_table_privilege(%s,'bulletin.allowed_accounts','SELECT')",(role,)).fetchone()[0]
            self.assertEqual(allowed,expected)
