-- DeepSeek V4 Flash intermittently ignored OpenRouter's strict response schema
-- on representative nightly corpora, returning either the schema definition or
-- Markdown. GPT-5.4 produced valid structured editions for both backfill dates.
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
    'All-author community-first nightly digest (GPT-5.4 structured output)',
    source."system_prompt",
    source."user_prompt_template",
    'openai/gpt-5.4',
    jsonb_set(
      source."parameters" - 'temperature',
      '{max_output_tokens}',
      '128000'::jsonb,
      true
    )
  from "public"."digest_prompt_versions" as source
  where source."label" = 'All-author community-first nightly digest (maximum output)'
  order by source."version" desc
  limit 1;

  if not found then
    raise exception 'maximum-output nightly digest prompt was not found';
  end if;
end
$$;
