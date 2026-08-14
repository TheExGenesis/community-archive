# Daily Digest design adoption

**Recorded:** August 13, 2026, 10:34 PM PDT

**Source:** Supplied “The Daily Digest” HTML design

## Outcome

The public Daily Digest edition and story pages now use the supplied editorial
design language while preserving the product behavior established in the
prototype.

## Adopted design decisions

- Flat, dark editorial canvas with a narrow top rule instead of a dashboard
  shell or collection of rounded cards.
- Small tracked masthead, large Petrona date/title typography, a double rule,
  and an italic edition standfirst.
- Main reading column paired with a narrower, rule-separated calendar and
  context rail.
- Strong story separators, generous vertical rhythm, and neutral type labels.
- Matching story-detail hierarchy for the headline, bangers, surrounding
  conversation, `In brief`, and editor's note.

## Product behavior deliberately preserved

- Top banger and story posts show complete text.
- Digest posts still use the canonical `TweetCard`; its new `editorial` variant
  changes presentation only and keeps profiles, links, metrics, archived media,
  videos, quoted tweets, and interaction analytics.
- Story media appears in its archived tweet context rather than as a duplicate
  standalone cover image.
- Loose editorial labels, verbatim tweet-excerpt titles, linked archive-search
  keywords, calendar navigation, story permalinks, and surrounding quote-post
  commentary remain intact.

## Verification scope

- Focused component tests cover full text and quoted-tweet fidelity in the new
  editorial variant.
- The August 11 mock edition and one story detail were visually checked against
  the supplied design in the local app.
- Full test, lint, type, production-build, preview-check, and remote visual
  results are recorded in the associated pull request.
