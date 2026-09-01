# Community Gallery Design Source of Truth

The original Community Gallery prototype is the binding visual reference for
`/community`. Implementation and accessibility guidance should help reproduce
this design, not reinterpret it into a generic landing page or card gallery.

## Approved scope and data

- Gallery landing, project modal, and submission flow only.
- No full project pages or creator profile pages.
- Use only verified, third-party projects from the Community Archive build
  thread. Exclude first-party Community Archive tools and fictional entries.
- Do not invent likes, view counts, popularity, creators, URLs, or project copy.

These current product decisions override any broader flows or placeholder data
shown in the historical prototype.

## Gallery fidelity requirements

- Flat theme background with no hero gradient or decorative hero elements.
- Centered hero at a 1280px page width: Petrona 38px, 1.06 line height,
  balanced wrapping, and an 840px maximum width. Keep `bots` on the second
  line with `visualizations` at desktop widths.
- Muted 17px centered subhead and a 520px-wide, 44px-tall pill search field.
- Sticky filter row below the 56px app header. Category chips sit left; a
  compact segmented sort and small submit button sit right.
- Default browsing is grouped into curated category sections with a Petrona
  title and one-line blurb. Show every project in each section, wrapping into
  additional rows instead of hiding projects behind a “Browse all” action.
  Searching or choosing a category switches to a single filtered grid.
- Project grids use three columns when space allows, 26px gaps, and do not
  stretch sections with fewer than three items beyond their natural card width.
- Project cards have no outer panel, fill, padding, shadow, or summary copy.
  The 16:10 cover is the card chrome, with a 12px radius and 1px border. Under
  it, show only the compact title row and `by <creator> · Free` metadata.
- Use real re-hosted screenshots where present. A missing screenshot uses a
  flat brand-ramp cover, subtle CSS motif, uppercase category label, and Petrona
  title. Do not add photographic overlays to gallery cards.
- Modal width is 620px. Its cover band is 200px with category and 44px Petrona
  title; photographed covers use the prototype scrim. The opaque modal body
  begins at least 8px below the image and follows the prototype’s compact
  22/26px padding and 15px stack rhythm.
- Preserve light/dark token behavior, keyboard focus, reduced-motion support,
  the empty state, live filtering, and responsive reflow at 940px.

## Explicit anti-drift rules

Do not introduce a hero gradient, eyebrow label, left-aligned hero, search in
the filter bar, generic “Community projects” heading, large project-count
header, bordered/shadowed card panels, descriptions inside gallery cards,
select-menu sorting, or oversized full-width submission CTA. When implementation
and this document differ visually, change the implementation to match this
document unless the user has explicitly requested a new direction.
