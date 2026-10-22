---
name: add-community-project
description: Add a community-made project to the /community gallery (Community Apps tab), or fix the card of a project already there — its cover image or its one-line summary. Use when asked to "add X to the community archive", "add X to the community tab/gallery", "give X a card", or "fix X's description".
---

# Add a project to the Community gallery

The `/community` page ("Community Apps") lists projects from two sources, merged
by `mergeCommunityCatalog` in `src/lib/communityProjects.ts`:

- **Curated entries** — `COMMUNITY_PROJECTS` in `src/lib/communityProjects.ts`.
- **Form submissions** — published rows of the `community_projects` table. Their
  card art and headline are fixed in code through `SUBMITTED_PROJECT_OVERRIDES`
  (keyed by the row's slug, e.g. `twesties-8a710e65`).

`PORTAL_TOOLS` in `src/components/portal/tools.tsx` (the /tools page) is a
separate, older list. "Add it to the community archive/tab" means the gallery,
not that list.

## 1. Check whether it is already listed

Load the live gallery and search the page source for the project name. The RSC
payload carries every card's `slug`, `summary`, `image` and `sourceTweetId`:

```js
// in the browser pane, on https://www.community-archive.org/community
const h = document.documentElement.innerHTML
h.slice(h.search(/"slug\\":\\"<name>/i) - 200, h.search(/"slug\\":\\"<name>/i) + 1500)
```

- Already there as a submission (slug ends in `-<8 hex>`) → add or edit its
  `SUBMITTED_PROJECT_OVERRIDES` entry (step 3–4 only). Don't duplicate it as a
  curated entry.
- Not there → add a curated entry (steps 2–5).

## 2. Gather verified facts

Never invent a launch post or a fact (see the comment on `COMMUNITY_PROJECTS`).

- **Project page**: fetch it; read `<title>`, `meta description`, `og:image`.
- **Launch post**: the tweet the user gave, or one you find. Confirm it via
  `https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=a` (gives the
  author handle, display name and date). Use its id as `sourceTweetId`.
- **Creator**: the display name as the gallery already shows it for that handle
  (e.g. `@strangestloop` is `Loopy`); `creatorHandle` without the `@`.
- **publishedAt**: the launch post's date (`YYYY-MM-DD`).

## 3. Make the card image

Cards are 1200×630 or 1200×750 webp files in `public/images/community/`.
Prefer the project's own social preview (`og:image`) when it reads well as a
title card — that's what Followle, Common Tongue and Twesties use. Convert it:

```bash
python3 -c "from PIL import Image; Image.open('og.png').save('public/images/community/<slug>-preview.webp', quality=85)"
```

Look at the result before using it. If there is no usable og:image, make a
title card in the project's own colors (name, short tagline, one motif), like
the `*-card.webp` files. Never hotlink `pbs.twimg.com`.

## 4. Write the copy

- `summary`: the card headline. **10–15 words**, one sentence, plain verbs,
  says what *you* can do with it (“Find who tweets any word, phrase, or website
  most across the archive.”). Submissions otherwise show their whole first
  sentence, which is usually too long — override it.
- `description`: 1–2 sentences for the detail view.
- `archiveUse`: one sentence on how it uses archive data.
- `category`: `Tools` | `Experiments` | `Research` | `Games`; 3 `tags`.
- `coverClass`: a Tailwind gradient from the image's colors (fallback while the
  image loads). `featured: false` unless the user asks.

Append curated entries to the end of `COMMUNITY_PROJECTS`.

## 5. Update the tests and verify

Adding a curated entry changes counts and orderings asserted in
`src/lib/communityProjects.test.ts` (catalog length, newest project, featured
Tools order) and `src/components/community/CommunityGallery.test.tsx`
(“N projects” for All and for the category). Update them, then:

```bash
pnpm install --frozen-lockfile   # fresh worktrees have no node_modules
npx jest src/lib/communityProjects.test.ts src/components/community
npx tsc --noEmit -p .
```

Open a PR against `main` with the project link and launch post in the body.
