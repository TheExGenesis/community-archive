-- Keep this private research table scoped to people with an X account.
ALTER TABLE private.profile_intelligence_runs
  ADD COLUMN IF NOT EXISTS x_handle text;
ALTER TABLE private.profile_intelligence_runs
  ADD COLUMN IF NOT EXISTS x_identity_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

-- The Cuties copy retains every profile. This table can be repopulated for
-- qualifying people from that source after their X identity is resolved.
DELETE FROM private.profile_intelligence_runs
  WHERE ca_account_id IS NULL AND x_handle IS NULL;

ALTER TABLE private.profile_intelligence_runs
  ADD CONSTRAINT profile_intelligence_runs_x_identity_check
    CHECK (ca_account_id IS NOT NULL OR x_handle IS NOT NULL),
  ADD CONSTRAINT profile_intelligence_runs_x_handle_format_check
    CHECK (x_handle IS NULL OR x_handle ~ '^[A-Za-z0-9_]{1,15}$');
