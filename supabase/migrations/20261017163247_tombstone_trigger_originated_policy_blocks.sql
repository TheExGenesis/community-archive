-- An explicit opt-out on public.optin records its block through
-- propagate_explicit_optout_scrape_block, so apply_policy_block_tombstone runs
-- at trigger depth 2. The pg_trigger_depth() > 1 guard, left over from the
-- retired per-row account trigger, skipped that block and left the opted-out
-- account's existing content live. Skip only the self-recursion caused by
-- tombstone_policy_account backfilling the block row's username.

CREATE OR REPLACE FUNCTION public.apply_policy_block_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_outer_account_id text := current_setting(
    'community_archive.policy_tombstone_account_id', true
  );
BEGIN
  -- tombstone_policy_account backfills this table's username, which re-fires
  -- this trigger for the account it is already scrubbing. Skip only that
  -- self-recursion. A block written by another trigger, such as an explicit
  -- opt-out propagated from public.optin, must still tombstone synchronously,
  -- so this must not be a pg_trigger_depth() guard.
  IF v_outer_account_id = NEW.account_id THEN
    RETURN NEW;
  END IF;

  PERFORM set_config(
    'community_archive.policy_tombstone_account_id', NEW.account_id, true
  );
  PERFORM public.lock_policy_account(NEW.account_id);
  PERFORM public.tombstone_policy_account(NEW.account_id);
  PERFORM set_config(
    'community_archive.policy_tombstone_account_id',
    COALESCE(v_outer_account_id, ''),
    true
  );
  RETURN NEW;
END;
$$;
