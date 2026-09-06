-- High-reasoning OpenRouter completions count reasoning and structured JSON
-- against the same completion ceiling. The 6,000-token v11 budget left fewer
-- than 1,000 tokens for JSON on representative 24-hour corpora, producing a
-- truncated or empty response. Prompt versions are immutable, so preserve v11
-- and fork its exact editorial instructions into v12 with sufficient headroom.
do $$
begin
  insert into "public"."digest_prompt_versions" (
    "label",
    "system_prompt",
    "user_prompt_template",
    "model",
    "parameters"
  )
  select
    'All-author community-first nightly digest (expanded output)',
    source."system_prompt",
    source."user_prompt_template",
    source."model",
    jsonb_set(
      source."parameters",
      '{max_output_tokens}',
      '12000'::jsonb,
      true
    )
  from "public"."digest_prompt_versions" as source
  where source."label" = 'All-author community-first nightly digest'
  order by source."version" desc
  limit 1;

  if not found then
    raise exception 'nightly digest v11 prompt was not found';
  end if;
end
$$;
