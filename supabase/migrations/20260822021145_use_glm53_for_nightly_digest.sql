-- GLM-5.3 produces strong digest prose, but its OpenRouter endpoint can ignore
-- response_format unless the prompt also states the JSON-only contract.
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
    'All-author community-first nightly digest (GLM-5.3 JSON output)',
    source."system_prompt" || E'\n\nOUTPUT CONTRACT: Return only one valid JSON object, with no Markdown, headings, code fences, or prose outside it. Use exactly these top-level keys: executive_summary, representative_tweet_index, stories, keywords. Return exactly three non-empty executive_summary strings and three to five complete stories. Each story must contain exactly these required, non-empty fields: category, title, subtitle, bullets, editorial_note, tweet_indices. category must be exactly one of: AI news, News, Viral joke, Meme, Culture, Opportunity, Other. bullets and tweet_indices must each contain at least one item. Return three to twelve non-empty keywords. The API-provided JSON schema is authoritative; never omit a required field or use an empty string or array.',
    source."user_prompt_template",
    'z-ai/glm-5.3',
    jsonb_set(
      jsonb_set(
        source."parameters",
        '{max_output_tokens}',
        '131072'::jsonb,
        true
      ),
      '{temperature}',
      '0.2'::jsonb,
      true
    )
  from "public"."digest_prompt_versions" as source
  where source."label" = 'All-author community-first nightly digest (GPT-5.4 structured output)'
  order by source."version" desc
  limit 1;

  if not found then
    raise exception 'GPT-5.4 nightly digest prompt was not found';
  end if;
end
$$;
