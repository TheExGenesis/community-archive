# Search experience plan

The search redesign ships in a separate, stacked pull request after the palette
and navigation work. Its sections should still be reviewed in this order so
result quality is approved before search becomes the primary signed-in
experience.

## Phase 1: Make search results clear and pleasant

Keep the existing search behavior, URL parameters, CSV export, and database
queries. Limit this PR to the results presentation.

- Replace the large nested results panel with a simple results header and a
  clean, single-column feed.
- Give every tweet a consistent hierarchy: author, handle, timestamp, text,
  media, engagement, and permalink.
- Constrain oversized media and use a predictable gallery treatment for one or
  multiple attachments.
- Improve spacing, line length, link treatment, and contrast in both themes.
- Add intentional loading skeletons plus useful empty, no-results, and error
  states.
- Preserve responsive behavior and make the narrow layout the baseline.

Acceptance checks:

- Review text-only tweets, long tweets, replies, tweets with links, and tweets
  with one or several media items.
- Verify empty, loading, error, and populated states in light and dark modes.
- Verify CSV download and tweet permalinks remain available.
- Check desktop and mobile widths and keyboard focus order.

## Phase 2: Simplify the search controls

Make the common path feel like a normal search rather than an advanced form.

- Lead with one prominent search field and a clear submit action.
- Move user and date filters into an optional filter panel.
- Show active filters as removable chips above the results.
- Keep filters encoded in the URL so searches remain shareable and browser
  navigation continues to work.
- Reuse the same query conventions in the header search and the full search
  page.
- Keep advanced operators available without making them required knowledge.

## Phase 3: Add the signed-in archive landing page

Add a focused landing experience for signed-in, opted-in members after the
results and controls are ready for review.

- Create an archive discovery page with a Wikipedia-like centered search field,
  a short explanation, and a few example searches.
- Send submitted searches to the improved results page with the query encoded
  in the URL.
- Add secondary paths to browse the User Directory and Products without
  competing with the primary search action.
- Keep the current contribution-oriented homepage for signed-out and not-yet-
  opted-in visitors.
- Route opted-in members to the discovery page after sign-in while keeping `/`
  available as the contribution-oriented homepage and Products anchor target.

## Success signals

- More searches reach a populated results state.
- Fewer users open and immediately close the advanced filters.
- Search-to-permalink clicks increase.
- The signed-in landing page does not reduce visits to archive upload, User
  Directory, or Products.
