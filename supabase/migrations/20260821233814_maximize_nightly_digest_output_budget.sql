-- OpenRouter currently advertises 384,000 completion tokens for the configured
-- model. Use the provider ceiling so hidden reasoning cannot crowd out the
-- small structured digest, while normal generations still stop naturally.
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
    'All-author community-first nightly digest (maximum output)',
    source."system_prompt",
    source."user_prompt_template",
    source."model",
    jsonb_set(
      source."parameters",
      '{max_output_tokens}',
      '384000'::jsonb,
      true
    )
  from "public"."digest_prompt_versions" as source
  where source."label" = 'All-author community-first nightly digest (expanded output)'
  order by source."version" desc
  limit 1;

  if not found then
    raise exception 'expanded-output nightly digest prompt was not found';
  end if;
end
$$;
