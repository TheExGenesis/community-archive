# Daily Digest editorial feedback: grounded titles and loose labels

Date: 2026-08-13

## Decisions

- Keep one deliberately loose editorial label instead of building a formal
  topic/type taxonomy. Useful examples are `AI news`, `News`, `Viral joke`,
  `Meme`, `Culture`, `Opportunity`, and `Other`.
- Remove banger, archived-quote, and reply totals from the Daily Digest story
  card header. Those counts remain available inside the story and on tweets.
- Use a short, vivid excerpt copied verbatim from one supplied tweet as the
  story title. The UI adds quotation marks; the model must not.
- Keep generated copy for the subtitle, `In brief`, and editor's note. The
  subtitle names the people, event, and significance that the quoted title
  leaves unstated, while the editor's note calls out a caveat, disagreement, or
  social dynamic without presenting analysis as a source fact.
- Render the edition abstract as three to five concrete bullet sentences rather
  than a prose paragraph.
- Render the top banger as the canonical full TweetCard with no clamp.
- Link every edition keyword to the existing Community Archive search page.
- Preserve the story page's surrounding quote-post conversation, `In brief`,
  and editor's note.

## August 11 fixture labels and title excerpts

| Story            | Label      | Verbatim title excerpt                                                              |
| ---------------- | ---------- | ----------------------------------------------------------------------------------- |
| Hidden reasoning | AI news    | We found a way to extract hidden reasoning of frontier models                       |
| Moon posting     | Viral joke | True and pure moon-posting is done from reverence and love                          |
| Grok Bot         | AI news    | Bots are AI teammates that do real work for you                                     |
| Formative women  | Meme       | You have to understand, these were the women I looked up to in my formative years   |
| Gemini / AI race | AI news    | Using this emergent behavior, we can watch the shifting market share in the AI race |

## Prompt draft

The executable version is inserted by
`20260814055701_refine_daily_digest_summary_and_subtitles.sql`.

### System prompt

> You are the Community Archive daily editor. Group related high-signal tweets
> into three to five coherent stories. Use mostly the posts themselves and
> minimal connective prose. Assign each story one intentionally loose editorial
> label from: AI news, News, Viral joke, Meme, Culture, Opportunity, Other.
> Choose the most useful shelf without overfitting a taxonomy. Keep the label
> separate from the keyword: every keyword must be a short phrase copied
> verbatim from at least one supplied post. Each story title must be a vivid
> contiguous three- to eighteen-word excerpt copied verbatim from one supplied
> banger or commentary post. Do not paraphrase, combine phrases, add ellipses,
> title-case the excerpt, or add quotation marks; the interface adds quotation
> marks. Include only supplied tweet IDs, never fabricate facts or engagement
> counts, and preserve meaningful disagreement. Because a source quote usually
> lacks context, write a one- or two-sentence subtitle that names the people,
> product, event, or format involved; states what happened; and explains why the
> grouped posts belong together. Never merely restate the quoted title. Clearly
> distinguish sourced claims from interpretation. Write one to three
> source-grounded In brief bullets. Write a short editor note that explains an
> important caveat, disagreement, or social dynamic and clearly distinguishes
> interpretation from source claims. Select useful quote-post commentary when
> it adds evidence, interpretation, disagreement, or a visible continuation of
> a meme.

### User prompt template

> Create the digest for `{{digest_date}}` covering `{{window_start}}` through
> `{{window_end}}`.
>
> Return three to five executive-summary bullets, three to five stories, and a
> short list of exact keywords found in the supplied posts. Prefer three summary
> bullets unless the day genuinely needs more. Each summary bullet must be one
> concrete sentence that names the day's subjects and developments; together
> they should let a reader understand the edition at a glance. For each story,
> choose a loose editorial label, copy the title excerpt from exactly one
> supplied post, and use the subtitle to supply the who, what, and why that the
> quote leaves unstated. Provide the In brief bullets and editor note, and include
> only supplied tweet IDs. A story should aggregate related bangers, not
> summarize a single post unless it clearly drove the day. When commentary is
> available, select two to five commentary tweet IDs that show the surrounding
> conversation; omit only posts that add no context.
>
> Candidate snapshot:
> `{{candidate_json}}`

## Evaluation checklist

For each generated edition, review:

1. Every title is a contiguous excerpt from exactly one supplied post and is
   still intelligible out of context.
2. Labels feel immediately useful; editors do not spend time debating taxonomy.
3. Story clusters are coherent and do not merge unrelated posts merely because
   both mention AI.
4. `In brief` preserves the important facts and disagreement without repeating
   the subtitle.
5. The editor's note contributes a caveat or interpretation and does not invent
   evidence.
6. Selected quote posts add context, dissent, or the next step in a meme.
7. The abstract contains three to five concrete bullets that accurately name
   the day's developments.
8. Every subtitle supplies missing who/what/why context rather than paraphrasing
   the quoted title.
