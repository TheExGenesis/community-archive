# Workflow dependency security exceptions

`package.json`, `.pnpmfile.cjs`, and the lockfile keep the shipped Workflow
**4.8.2** graph while addressing vulnerable transitive dependencies. Validate
changes with **Node 24.22.1 / pnpm 9.1.0**, a frozen install, and
`pnpm test:security`. The pull request workflow runs this focused suite alongside
the ordinary application checks.

## Nanoid: fixed supported branch, preserved replay

The exact `@workflow/core@4.8.2>nanoid` override selects the unchanged official
**3.3.20** package. This supported branch fixes both Nanoid advisories; the old
**5.1.6** package is affected. Workflow uses
`customRandom(urlAlphabet, 21, seededRandom)`, whose IDs, consumed bytes, and
subsequent PRNG state must remain identical for persisted-event replay.

The regression suite exercises actual core suspension/replay and Node/browser
exports against golden results captured with core 4.8.2 and Nanoid 5.1.6. It also
checks the secure-generator overflow and non-secure negative-size fixes. General
Nanoid API equivalence across majors is not promised. Seeded hook IDs retain
their existing security model.

Keep `tests/security/fixtures/nanoid-workflow-5.1.6.json` as historical evidence;
do not regenerate it to accept changed output. Review any Workflow/core, Nanoid,
export-resolution, bundler, alphabet, size, or random-source change against these
fixtures before changing or removing the selector.

## Zod: stock security fix, explicit serialized optionality

Seven exact parent selectors move **Zod 4.1.11 / 4.3.6 → 4.6.6** for core,
world, local world, Vercel world, Workflow CLI, Vercel CLI auth, and Vercel CLI
config. Stock Zod supplies the oversized array/set/map rejection fix; it is not
patched.

`patches/@workflow__world@4.3.1.patch` makes five historically optional
serialized fields explicitly optional: completed run `output`, completed step
`result`, created step `input`, received hook `payload`, and created run `input`.
The patch aligns upstream source, distributed JavaScript, and declarations.
It preserves acceptance of omitted fields after JSON drops `undefined`, leaves
the exported `SerializedDataSchema` unchanged, and retains Zod's security guard.
Tests cover field values and missing keys, invalid sibling/state structures,
actual local storage reads, bounded collection rejection, and synthetic CLI
auth/config consumers.

Keep all seven selectors and the version-specific world patch together. A
Workflow/world or Zod update requires checking each field site, retaining the
security rejection tests, and revising/removing the patch only with demonstrated
compatibility. Preserve unified-patch context whitespace: `.gitattributes`
excludes only patch files from whitespace-error checks. The lock's patch hash
and frozen installation verify the exact patch artifact.

## Cache semantics: remove an unused adapter

The pnpm 9 `readPackage` hook removes only the unused
`workflow@4.8.2 → @workflow/nest` edge. This Next.js app uses Workflow root,
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

## Release and rollback

These changes require no database migration, persisted-data rewrite, or live
Workflow invocation. Synthetic local tests do not establish every hosted runtime
or deployment-skew behavior. Reverting the dependency remediation restores the
previous vulnerable graph, so evaluate that security tradeoff explicitly.
