# Workflow dependency security exceptions

`package.json`, `.pnpmfile.cjs`, and the lockfile keep the Workflow **5.2.2**
graph (Ask the archive's `@ai-sdk/workflow` agent needs Workflow 5) while
addressing vulnerable transitive dependencies. Validate
changes with **Node 24.22.1 / pnpm 9.1.0**, a frozen install, and
`pnpm test:security`. The pull request workflow runs this focused suite alongside
the ordinary application checks.

## Nanoid: fixed supported branch, preserved replay

The exact `@workflow/core@5.2.2>nanoid` override selects the unchanged official
**3.3.20** package. This supported branch fixes both Nanoid advisories; the old
**5.1.6** package is affected. Workflow uses
`customRandom(urlAlphabet, 21, seededRandom)`, whose IDs, consumed bytes, and
subsequent PRNG state must remain identical for persisted-event replay.

The regression suite exercises actual core suspension/replay and Node/browser
exports against golden results captured with unmodified core 5.2.2 and Nanoid
5.1.6 (`nanoid-workflow-core5.2.2.json`). It also
checks the secure-generator overflow and non-secure negative-size fixes. General
Nanoid API equivalence across majors is not promised. Seeded hook IDs retain
their existing security model.

Keep `tests/security/fixtures/nanoid-workflow-5.1.6.json` (core 4.8.2) as
historical evidence. Do not regenerate either fixture to accept changed output. Review any Workflow/core, Nanoid,
export-resolution, bundler, alphabet, size, or random-source change against these
fixtures before changing or removing the selector.

## Zod: stock security fix, unchanged serialized optionality

Seven exact parent selectors move **Zod 4.1.11 / 4.5.4 → 4.6.6** for core,
world, local world, Vercel world, Workflow CLI, Vercel CLI auth, and Vercel CLI
config. Stock Zod supplies the oversized array/set/map rejection fix; it is not
patched.

Workflow 4 needed a world patch because Zod 4.6 stopped treating five
serialized fields as implicitly optional. Workflow 5's world already declares
run `output` optional and requires `result`, `input`, `payload`, and `input` on
`step_completed`, `step_created`, `hook_received`, and `run_created`; stock Zod
4.5.4 and 4.6.6 give identical results on every serialized-field case, so no
patch is needed. Its local reader still restores a key that JSON dropped. Tests
pin that parity, invalid sibling/state structures, actual local storage reads,
bounded collection rejection, and synthetic CLI auth/config consumers.

Keep all seven selectors together. A Workflow/world or Zod update requires
re-running the field cases against stock and overridden Zod and retaining the
security rejection tests.

## Cache semantics: remove an unused adapter

The pnpm 9 `readPackage` hook removes only the unused
`workflow@5.2.2 → @workflow/nest` edge. This Next.js app uses Workflow root,
API, runtime, and Next integration. Removing Nest prunes its SWC CLI/downloader
closure, including `http-cache-semantics@4.2.0`. This is dependency removal;
the disputed upstream cache advisory has no confirmed patched version, and no
version bump or advisory dismissal is used to claim a fix.

The hook rejects any different Workflow version until this decision is reviewed.
Keep the hook in the package-manager inputs. Adding Nest support requires
revisiting its downloader/cache behavior and the dependency boundary. The focused
test checks hook scope, graph absence, retained imports/configuration and CLI,
and actual Next Workflow compilation of a synthetic fixture without executing a
run. Its optional `--baseline` HTTP reproduction requires the original graph
and is not part of normal CI.

## Undici

Exact selectors move `@workflow/world-local@5.1.1`, `@workflow/world-vercel@5.2.2`
and `guarded-fetch@0.1.3` (from just-bash) to **undici 7.30.1**.

## Release and rollback

These changes require no database migration or persisted-data rewrite. On Vercel,
Workflow 4 queues each message to the deployment that produced it and Workflow 5
enforces deployment affinity, so a run started on 4.8.2 finishes on its original
deployment while that deployment is retained. That comes from reading the
package source; no live cross-version run was exercised. Synthetic local tests do not establish every hosted runtime
or deployment-skew behavior. Reverting the dependency remediation restores the
previous vulnerable graph, so evaluate that security tradeoff explicitly.
