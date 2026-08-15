# Homepage archive selection

_2026-08-14 16:29 PDT_

## Decision

The homepage now uses two archive-selection paths:

- Signed-in members see up to eight accounts from the existing persisted, current-calendar-year interaction result. The cache counts mentions, replies, quotes, and reposts; its year-scoped serving rows are refreshed in the background and the homepage revalidates every five minutes.
- Guests see eight archives sampled on each render from a 29-person editorial pool. The sampler chooses one person from each of eight subject/community buckets and then shuffles the result, so follower count does not dominate the homepage.
- The selected accounts are resolved in one batched `user_directory` read. This filters interaction targets to Community Archive users and supplies current usernames, avatars, and archived tweet counts for the captions. The verified editorial pool also stores a production tweet-count snapshot so guest captions remain present when a sparse preview directory triggers the intended local fallback.

The personalized path calls the existing `/analytics/user/:identifier/interactions?year=…` resource with the current UTC year. That route already resolves usernames, reads the persisted year-scoped interaction cache, and returns a scope marker that the homepage validates before rendering.

## Guest candidate pool

| Editorial bucket              | Candidates                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| AI builders and research      | roon (`tszzl`), David Dalrymple (`davidad`), Rob Miles (`robertskmiles`)                                                                     |
| Startups and operators        | Patrick McKenzie (`patio11`), Emmett Shear (`eshear`)                                                                                        |
| Scenius and community         | Visa (`visakanv`), Richard D. Bartlett (`RichDecibels`), Tyler Alterman (`TylerAlterman`)                                                    |
| Culture and philosophy        | Janus (`repligate`), Qiaochu Yuan (`QiaochuYuan`), Malcolm Ocean (`Malcolm_Ocean`), Romeo Stevens (`RomeoStevens76`)                         |
| Qualia and contemplative work | Andrés Gómez Emilsson / Captain Pleasure (`algekalipso`), Tasshin Fogleman (`tasshinfogleman`), Vivid Void (`vividvoid`)                     |
| Deep tech and tools           | Danielle Fong (`DanielleFong`), Johnson (`johnsonmxe`), Teknium (`Teknium`), Conor White-Sullivan (`Conaw`), Ben Reinhardt (`Ben_Reinhardt`) |
| Writers and internet culture  | eigenrobot (`eigenrobot`), Katie Bakes (`katiebakes`), Zvi Mowshowitz (`TheZvi`), Gleech (`gleech`), thebes (`voooooogel`)                   |
| Broader community voices      | Christine (`christineist`), No Silver (`nosilverv`), Priya Rose (`Prigoose`), Nathan Young (`NathanpmYoung`)                                 |

Goth, Nous Research, Wilderless, and Miguel Piedrafita are not in the pool.

## Banger signal

As a directional input, a read-only production ClickHouse query counted active banger rankings for current archive members where the ranked quote count was greater than two. Relevant leaders included Visa (430 qualifying bangers), Qiaochu Yuan (149), Richard D. Bartlett (88), Tyler Alterman (73), Wilderless (67), Janus (60), Emmett Shear (50), Malcolm Ocean (47), eigenrobot (44), Tasshin (44), Andrés Gómez Emilsson (25), and Patrick McKenzie (16).

This is useful evidence for a candidate pool, but not a sufficient homepage ranking: a raw top-24 list would overrepresent prolific adjacent clusters and underrepresent the range of the archive. The stratified pool keeps the banger signal while guaranteeing subject diversity.

## Avatar and failure behavior

All 29 stored avatar URLs returned HTTP 200 during validation. The shared avatar list also now retries missing or failed images through the existing bounded profile-avatar recovery route, then retains the initials fallback if recovery is unavailable. Compact cards reserve enough width and two username lines so long handles cannot overlap their neighbors. `tessera_antra` is explicitly excluded from homepage selections and was replaced in the editorial pool by `nosilverv`.

If member identity or interaction analytics is unavailable, the signed-in homepage degrades to the guest featured sample instead of leaving an empty strip.

## Validation

- Focused server/client Jest suites cover member selection, guest sampling, avatar recovery, homepage composition, and interaction response parsing.
- TypeScript and lint run as repository-level static checks.
- A protected Vercel preview browser pass verifies eight rendered guest profiles, loaded avatars, tweet-count captions, the `tessera_antra` exclusion, and no Next.js error overlay.
