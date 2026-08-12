# Homepage archive selection

_2026-08-14 16:29 PDT_

## Decision

The homepage now uses two archive-selection paths:

- Signed-in members see up to eight accounts from the existing cached `topInteractedAccounts` analytics result. The cache counts mentions, replies, quotes, and reposts and is refreshed every five minutes.
- Guests see eight archives sampled on each render from a 24-person editorial pool. The sampler chooses one person from each of eight subject/community buckets and then shuffles the result, so follower count does not dominate the homepage.

The current interaction projection is all-time. A one- or two-year preference should be added at the gateway/cache layer later; the homepage deliberately does not introduce an uncached ClickHouse query or pretend the present cache is time-weighted.

## Guest candidate pool

| Editorial bucket              | Candidates                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| AI builders and research      | roon (`tszzl`), David Dalrymple (`davidad`), Rob Miles (`robertskmiles`)                                                 |
| Startups and operators        | Patrick McKenzie (`patio11`), Emmett Shear (`eshear`), Miguel Piedrafita (`m1guelpf`)                                    |
| Scenius and community         | Visa (`visakanv`), Richard D. Bartlett (`RichDecibels`), Tyler Alterman (`TylerAlterman`)                                |
| Culture and philosophy        | Janus (`repligate`), Qiaochu Yuan (`QiaochuYuan`), Malcolm Ocean (`Malcolm_Ocean`)                                       |
| Qualia and contemplative work | Andrés Gómez Emilsson / Captain Pleasure (`algekalipso`), Tasshin Fogleman (`tasshinfogleman`), Vivid Void (`vividvoid`) |
| Deep tech and tools           | Danielle Fong (`DanielleFong`), Teknium (`Teknium`), Conor White-Sullivan (`Conaw`)                                      |
| Writers and internet culture  | Wilderless (`the_wilderless`), eigenrobot (`eigenrobot`), Katie Bakes (`katiebakes`)                                     |
| Broader community voices      | Christine (`christineist`), Tess (`tessera_antra`), Priya Rose (`Prigoose`)                                              |

Goth and Nous Research are not in the pool.

## Banger signal

As a directional input, a read-only production ClickHouse query counted active banger rankings for current archive members where the ranked quote count was greater than two. Relevant leaders included Visa (430 qualifying bangers), Qiaochu Yuan (149), Richard D. Bartlett (88), Tyler Alterman (73), Wilderless (67), Janus (60), Emmett Shear (50), Malcolm Ocean (47), eigenrobot (44), Tasshin (44), Andrés Gómez Emilsson (25), and Patrick McKenzie (16).

This is useful evidence for a candidate pool, but not a sufficient homepage ranking: a raw top-24 list would overrepresent prolific adjacent clusters and underrepresent the range of the archive. The stratified pool keeps the banger signal while guaranteeing subject diversity.

## Avatar and failure behavior

All 24 stored avatar URLs returned HTTP 200 during validation. The shared avatar list also now retries missing or failed images through the existing bounded profile-avatar recovery route, then retains the initials fallback if recovery is unavailable.

If member identity or interaction analytics is unavailable, the signed-in homepage degrades to the guest featured sample instead of leaving an empty strip.

## Validation

- Focused server/client Jest suites cover member selection, guest sampling, avatar recovery, homepage composition, and interaction response parsing.
- TypeScript and lint run as repository-level static checks.
- A local production-backed browser pass verifies rendered guest avatars, no console errors, and no Next.js error overlay.
