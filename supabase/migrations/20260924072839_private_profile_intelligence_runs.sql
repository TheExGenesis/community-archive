-- Private research ledger, deliberately outside the Community Archive Data API.
CREATE TABLE IF NOT EXISTS private.profile_intelligence_runs (
  subject_key text NOT NULL,
  cuties_user_id uuid,
  ca_account_id text,
  profile_run_id text NOT NULL,
  blurb_id text NOT NULL,
  long_profile text NOT NULL,
  profile_data jsonb NOT NULL,
  blurb_text text NOT NULL,
  blurb_data jsonb NOT NULL,
  provenance jsonb NOT NULL,
  profile_generated_at timestamptz NOT NULL,
  blurb_generated_at timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_intelligence_runs_pkey
    PRIMARY KEY (subject_key, profile_run_id, blurb_id),
  CONSTRAINT profile_intelligence_runs_subject_check
    CHECK (cuties_user_id IS NOT NULL OR ca_account_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_profile_intelligence_cuties_recent
  ON private.profile_intelligence_runs
  (cuties_user_id, profile_generated_at DESC, blurb_generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_intelligence_account_recent
  ON private.profile_intelligence_runs
  (ca_account_id, profile_generated_at DESC, blurb_generated_at DESC)
  WHERE ca_account_id IS NOT NULL;

ALTER TABLE private.profile_intelligence_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.profile_intelligence_runs
  FROM PUBLIC, anon, authenticated, readclient, service_role;
