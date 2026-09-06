-- Keep the proven GLM-5.3 JSON-only prompt contract while moving new nightly
-- runs to the lower-latency GLM-5.3-Flash model. Prompt versions are immutable,
-- so retries of existing runs continue to use their originally saved version.
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
    'All-author community-first nightly digest (GLM-5.3-Flash JSON output)',
    source."system_prompt",
    source."user_prompt_template",
    'z-ai/glm-5.3-flash',
    source."parameters"
  from "public"."digest_prompt_versions" as source
  where source."label" = 'All-author community-first nightly digest (GLM-5.3 JSON output)'
  order by source."version" desc
  limit 1;

  if not found then
    raise exception 'GLM-5.3 nightly digest prompt was not found';
  end if;
end
$$;
