-- Prompt versions are immutable. The nightly digest was bundling bangers that
-- only shared a broad topic (2026-11-04: ICE's "we will find you" post, a Nick
-- Fuentes post, and a "Don't vote" take became one "elections" story). This
-- version adds a story-bundling rule: bangers share a story only through a
-- specific shared event, claim, thread, or direct exchange, and a lateral link
-- must be stated in the story.
--
-- It copies the newest Opus 5.5 prompt and inserts text at two anchors instead
-- of restating the whole prompt, so it composes with other prompt migrations
-- that edit different sentences, whichever is applied first.
do $$
declare
  bundling_label constant text := 'All-author community-first nightly digest (Claude Opus 5.5, 32k output cap, strict story bundling)';
  system_anchor constant text := 'OUTPUT CONTRACT:';
  system_rule constant text := 'STORY BUNDLING: A story is one event, claim, thread, or direct exchange, not a topic. Put bangers in the same story only when they share a strong, specific connection: they report or react to the same event or announcement, make or dispute the same specific claim, sit in the same reply or quote thread, or are a direct exchange between their authors. A shared broad subject, such as an election, AI, a holiday, or a platform, is never enough on its own. Before merging two bangers, name the specific link in a few words; if all you can name is a topic, keep them apart. When the link is real but lateral, such as one post answering another without quoting it or two independent posts making the same specific claim, the subtitle or an In brief bullet must say explicitly how the posts connect and why each matters to the other. Give a weakly linked banger its own story if it is strong enough to make the edition; otherwise leave it out. Prefer a tight story over a bigger loose one, and prefer dropping a banger over attaching it where it does not belong. Put reply, quote, and thread rows only in the story that contains their parent banger.' || chr(10) || chr(10);
  template_anchor constant text := 'add reply or quote indices when they clarify the surrounding conversation.';
  template_rule constant text := ' Follow the STORY BUNDLING rule: bangers share a story only through the same event, claim, thread, or direct exchange, never a shared broad topic alone, and a lateral link must be stated in the story.';
  source_row "public"."digest_prompt_versions"%rowtype;
begin
  if exists (
    select 1 from "public"."digest_prompt_versions"
    where "model" = 'anthropic/claude-opus-5.5'
      and "system_prompt" like '%STORY BUNDLING:%'
  ) then
    return;
  end if;

  select * into source_row
  from "public"."digest_prompt_versions"
  where "model" = 'anthropic/claude-opus-5.5'
  order by "version" desc
  limit 1;

  if not found then
    raise exception 'No Claude Opus 5.5 nightly digest prompt was found';
  end if;
  if position(system_anchor in source_row."system_prompt") = 0 then
    raise exception 'Digest system prompt has no "%" anchor', system_anchor;
  end if;
  if position(template_anchor in source_row."user_prompt_template") = 0 then
    raise exception 'Digest user prompt template has no "%" anchor', template_anchor;
  end if;

  insert into "public"."digest_prompt_versions" (
    "label",
    "system_prompt",
    "user_prompt_template",
    "model",
    "parameters"
  )
  values (
    case
      when source_row."label" = 'All-author community-first nightly digest (Claude Opus 5.5, 32k output cap)'
        then bundling_label
      else left(source_row."label" || ' + strict story bundling', 120)
    end,
    replace(source_row."system_prompt", system_anchor, system_rule || system_anchor),
    replace(source_row."user_prompt_template", template_anchor, template_anchor || template_rule),
    source_row."model",
    source_row."parameters"
  );
end
$$;
