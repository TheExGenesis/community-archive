-- Prompt versions are immutable. New nightly runs use Opus 5.5 while existing
-- runs keep the model and prompt version they started with.
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
    'All-author community-first nightly digest (Claude Opus 5.5)',
    source."system_prompt",
    source."user_prompt_template",
    'anthropic/claude-opus-5.5',
    jsonb_set(
      source."parameters" - 'temperature',
      '{max_output_tokens}',
      '128000'::jsonb,
      true
    )
  from "public"."digest_prompt_versions" as source
  where source."label" = 'All-author community-first nightly digest (GLM-5.3-Flash JSON output)'
  order by source."version" desc
  limit 1;

  if not found then
    raise exception 'GLM-5.3-Flash nightly digest prompt was not found';
  end if;
end
$$;
