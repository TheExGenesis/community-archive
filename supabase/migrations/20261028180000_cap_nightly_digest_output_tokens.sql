-- Prompt versions are immutable. OpenRouter rejects a request whose
-- max_tokens the remaining credit cannot cover, and digests use ~3-8k output
-- tokens, so new nightly runs reserve 32k instead of 128k. Idempotent because
-- production received this row before the migration was merged.
do $$
begin
  if exists (
    select 1 from "public"."digest_prompt_versions"
    where "label" = 'All-author community-first nightly digest (Claude Opus 5.5, 32k output cap)'
  ) then
    return;
  end if;

  insert into "public"."digest_prompt_versions" (
    "label",
    "system_prompt",
    "user_prompt_template",
    "model",
    "parameters"
  )
  select
    'All-author community-first nightly digest (Claude Opus 5.5, 32k output cap)',
    source."system_prompt",
    source."user_prompt_template",
    source."model",
    jsonb_set(source."parameters", '{max_output_tokens}', '32000'::jsonb, true)
  from "public"."digest_prompt_versions" as source
  where source."label" = 'All-author community-first nightly digest (Claude Opus 5.5)'
  order by source."version" desc
  limit 1;

  if not found then
    raise exception 'Claude Opus 5.5 nightly digest prompt was not found';
  end if;
end
$$;
