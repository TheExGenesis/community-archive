-- Adds one model call's or one paid tool's tokens and cost to an agent search
-- run as the spend happens, so the global daily cap counts runs in progress
-- and a stopped run keeps what it spent. Increments only: concurrent steps of
-- one run cannot overwrite each other's spend.
CREATE OR REPLACE FUNCTION public.agent_search_add_usage(
  p_run_id text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost_usd numeric
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_run_id IS NULL
    OR coalesce(p_input_tokens, 0) < 0
    OR coalesce(p_output_tokens, 0) < 0
    OR coalesce(p_cost_usd, 0) < 0
  THEN
    RAISE EXCEPTION 'Invalid agent search usage' USING ERRCODE = '22023';
  END IF;
  UPDATE public.agent_search_runs
  SET input_tokens = input_tokens + coalesce(p_input_tokens, 0),
      output_tokens = output_tokens + coalesce(p_output_tokens, 0),
      cost_usd = cost_usd + coalesce(p_cost_usd, 0)
  WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent search run % not found', p_run_id USING ERRCODE = 'P0002';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.agent_search_add_usage(text, integer, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_search_add_usage(text, integer, integer, numeric) TO service_role;
