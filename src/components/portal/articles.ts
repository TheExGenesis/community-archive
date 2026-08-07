export interface PortalArticle {
  id: string
  tag: string
  title: string
  meta: string
  excerpt: string
  paras: string[]
}

export const PORTAL_ARTICLES: PortalArticle[] = [
  {
    id: 'naming',
    tag: 'Etymology',
    title:
      'The naming of tpot: from ingroup to postrat to “this part of twitter”',
    meta: 'Field note · 12 Jul 2026 · 6 min read',
    excerpt:
      'A community that renames itself every eighteen months leaves unusually clean sediment. We traced every self-referential label in the corpus.',
    paras: [
      'Communities usually receive names from outsiders. This one kept trying to name itself, and the archive lets us watch each attempt fossilize in place. The earliest self-referential label in the corpus is simply “ingroup,” appearing in mid-2019 with the unselfconscious confidence of a group that does not yet expect to be observed.',
      '“Postrat” arrives in late 2019 as a genuine position — post-rationalist, defined against something. By 2021 the term is used more often in scare quotes than without them, the reliable sign that a label has begun its descent into irony. Frequency data shows postrat peaking in 2021, then declining every year since.',
      '“tpot” — this part of twitter — wins precisely because it refuses to be a name. It makes no claim about beliefs, only about topology: you are here, near these accounts. The corpus shows it overtaking postrat in March 2022 and never looking back. A community that had argued about its identity for three years settled, finally, on a deictic.',
    ],
  },
  {
    id: 'psyop',
    tag: 'Semantics',
    title: 'Psyop: the career of a word, 2019–2024',
    meta: 'Field note · 28 Jun 2026 · 5 min read',
    excerpt:
      'From military jargon to term of endearment in five years. Frequency analysis of semantic bleaching in real time.',
    paras: [
      'In 2019 “psyop” appears in the corpus rarely, and always meaning a deliberate influence operation. By 2024 it appears hundreds of times per year, and in the majority of cases it means something closer to “an idea I encountered and have feelings about.” The archive lets us watch semantic bleaching happen at weekly resolution.',
      'The pivot is traceable to a cluster of tweets in mid-2020 using “psyop” reflexively — “this is a psyop I endorse,” “psyop me harder.” Irony is the solvent: once a word can be used about oneself, its accusatory power drains within months. By 2022 “good psyop” outnumbers “psyop”-as-accusation in the corpus.',
      'The word is now entering its nostalgic phase — tweets about how psyop used to mean something. These meta-complaints are themselves a reliable stage in the lifecycle, arriving roughly when a term reaches 80% of peak frequency. We expect “psyop” to be effectively retired from live use by 2027, preserved only in the canon.',
    ],
  },
  {
    id: 'vibecamp',
    tag: 'Ritual',
    title: 'Vibecamp and the ritual calendar of a digital tribe',
    meta: 'Field note · 15 Jun 2026 · 7 min read',
    excerpt:
      'Online communities are supposed to be placeless and timeless. Then this one invented a pilgrimage, and the whole corpus reorganized around it.',
    paras: [
      'Before 2022, the archive shows no periodicity beyond the weekly rhythm of work-posting. After the first vibecamp, an annual cycle appears in the data as clearly as a growth ring: anticipation posting rises eight weeks out, peaks during the event, and resolves into a two-week afterglow of “vibecamp was…” retrospectives.',
      'The pilgrimage did something the timeline could not: it gave the community a shared calendar. Ticket-drop days now function as festivals. The corpus shows mutual-follow density increasing measurably in the month after each camp — the digital tribe uses physical co-presence to renew its edges.',
      'Most striking is the emergence of before/after language. Accounts date themselves by camps the way other communities use graduation years. “I met them at vc3” is now a standard unit of relational chronology, appearing in hundreds of tweets in the corpus.',
    ],
  },
  {
    id: 'canon',
    tag: 'Canon',
    title: 'Canon formation: which tweets get remembered?',
    meta: 'Field note · 02 Jun 2026 · 8 min read',
    excerpt:
      'Of millions of tweets, perhaps two hundred are load-bearing. What predicts whether a tweet enters the community’s permanent memory?',
    paras: [
      'We define a canonical tweet operationally: one that is still being referenced, quoted, or screenshotted more than a year after posting. By this measure the corpus contains roughly 200 canonical tweets — a vanishing fraction of the archive. Virality predicts canon entry surprisingly poorly; many of the most-liked tweets in the corpus are never referenced again.',
      'What predicts canonization is quotability under compression: canonical tweets are almost always a single sentence, name a pattern people had felt but not articulated, and contain no timestamps, links, or context that would date them. They are proverbs in the technical sense — portable wisdom, stripped of provenance.',
      'The most reliable signal is second-wave citation: a tweet referenced by a different subcluster than the one it was posted into. Canon is what survives translation across the community’s internal borders. The archive makes these border crossings visible for the first time.',
    ],
  },
  {
    id: 'schism',
    tag: 'Kinship',
    title: 'The great wordcel/rotator schism of 2022',
    meta: 'Field note · 19 May 2026 · 6 min read',
    excerpt:
      'A joke taxonomy became a genuine identity axis in under six months. Anatomy of a memetic speciation event.',
    paras: [
      'The wordcel/shape-rotator distinction enters the corpus in January 2022 as an obvious joke — a mock-taxonomy in the tradition of hobbit/elf classification. Within six months, accounts were unironically self-identifying, and the joke had acquired the full apparatus of an identity: in-group flattery, out-group teasing, conversion narratives.',
      'The speed is the interesting part. Prior identity axes in the corpus (postrat/rat, mystic/materialist) took years to stabilize. Wordcel/rotator stabilized in months because it arrived pre-equipped with a test: what do you do, verbally or spatially? Identities with cheap diagnostics spread faster.',
      'By 2023 the terms decoupled from their referents entirely — “wordcel” now often means simply “writes long posts.” The taxonomy survives as kinship vocabulary long after its predictive content has evaporated, which is roughly the fate of all successful taxonomies in this corpus.',
    ],
  },
]
