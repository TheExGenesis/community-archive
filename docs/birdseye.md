# Birdseye

Birdseye is a native app at `/birdseye`, linked from Community Apps. It displays
saved analyses without generating new content or depending on Modal at request time.

## Access and data

Analyses are private by default. Owners access their own analysis through a verified
Twitter identity and matching account ID. Real administrators may inspect eligible
profiles through `/birdseye/profiles`, without enabling sharing on another owner's
behalf. Membership and explicit opt-outs apply on every read, including to admins.
Saved topics naming an opted-out participant are withheld.

The existing private Supabase Storage bucket `community-app-data` supplies
`manifest.json` and `v1/<import-id>/birdseye/<username>.json`. The manifest includes
its version, immutable prefix, and Birdseye username/hidden-topic catalog. Objects
are read server-side with the existing service-role client; never expose bucket
objects or signed URLs to the browser. No schema migration is required. Snapshot
content is cached for five minutes, independently of the fresh policy checks.

Owners may enable, rotate, or revoke a bearer share link. Only a SHA-256 hash and
bound Twitter identity are stored in server-controlled Auth app metadata. Each
read checks fresh Auth metadata. The link route validates the secret and redirects
to a clean URL with an HttpOnly, SameSite=Lax cookie. Revocation stops future reads;
it cannot recall downloaded copies. Private responses use no-store, no-referrer,
and noindex headers. Private content, including insight popover portals, excludes
PostHog capture. Do not log share tokens or include them in analytics.

## Presentation

Profiles open on an overview ordered by unique cited-post count. Topics show an
expandable summary, three fully rendered sample posts ranked by likes with owner posts prioritized,
a monthly chart cropped to first/last cited month, horizontal yearly summaries,
compact insight panels, and the remaining sources. Month counts work with hover,
keyboard focus, and tap. Insight descriptions and source links open on demand.
A “How Birdseye works” disclosure links to the original explanatory post.
The narrower source feed supports most recent, most liked, and banger-score order;
each reply group ranks by its newest or highest-scoring post, with parent-first
order inside the group. Changing order resets pagination. Birdseye tweet images,
including quotes, occupy at most 25svh (capped at 240px); the lightbox retains
the full-size image.

Sample ranking and reply grouping query only the topic's exact reference IDs.
Standalone cards are limited to the profile owner's posts and cited reply groups
containing an owner post. Quote links do not connect reply groups: a quoted thread
appears only inside the quoting tweet unless the owner also participates in its
reply conversation. This filter runs before sample ranking and source pagination.
Full-fidelity TweetCard payloads use the configured archive reader and fresh opt-out
checks; they never switch analytical record sources on failure. Related cited posts
share thread blocks across six-post pages. No uncited parents or other conversation
content is fetched. Samples are excluded from the remaining feed. A source without enough metadata to establish owner participation is omitted;
lookup failures are retryable errors. Banger scores count distinct non-self quote
tweets from current members using indexed, paginated quote-relation lookups for
only the eligible topic IDs. Membership and opt-outs are checked after the cached
quote-author metadata is read. Score failures produce retryable errors, not zeroes.

Counts describe saved references, including conversation context, rather than all
activity in an archive. Display changes do not refresh analyses.

## Local development

The standard dev scripts bind to loopback and enable `LOCAL_ADMIN_PREVIEW=true`.
The local admin read preview requires development mode, a loopback Host, and no
Vercel deployment marker. The account menu supports persistent logout and restarting
the preview. It creates no Auth user and grants no production write permissions.
Set `COMMUNITY_APP_DATA_DIR` to an existing normalized snapshot directory to avoid
Storage downloads. OAuth remains available; mock login is disabled for production
Supabase. Runtime credentials must come from the configured environment.

## Release and rollback

Before release, confirm the bucket is private and its manifest and a representative
Birdseye object are readable using the production server credentials. Verify private
access, sharing/revocation, opt-outs, and sample/source pagination with focused tests.
Use local or staging identities for share mutation tests; never change a production
owner's sharing for verification.

Ship through the normal main-branch Vercel deployment. Check the Apps link and the
private landing/API gates after deployment. A website rollback needs no database
rollback: revert the release commit, or restore the previous ready production
Vercel deployment. Storage remains private and unchanged. For a future snapshot
replacement, upload immutable versioned objects before switching the manifest,
and retain the old manifest for independent data rollback.
