# wider community archive roadmap

## "**wide**" infrastructure

- [x] db for tweets (Sep 2024)
- [x] serve db through HTTP API (Sep 2024)
- [x] browser extension to keep db up to date (Jan 2025)
- [x] embeddings infrastructure (Feb 2025)
- [ ] semantic search API (Mar 2025)

## "tall" apps

- [x] Keyword trends app (Oct 2024)
- [x] "Birdseye" view of personal tweet topic clusters (Jan 2024)
- [x] "Banger bot" twitter bot informed by CA bangers (Feb 2025)
- [ ] "Talk to archive" app, RAG + SQL queries on db
- [ ] argument mapping

## nooscope track

A lens into the world of ideas. Would need some R&D but I think we definitely need really fast (possibly WASM?) interoperable primitives and ways to experiment with them on interfaces.

- [ ] fast tweet embeddings (potentially small model and quantized, for speed)
- [ ] fast hierarchical clustering, (running HDBSCAN remotely? WASM implementation?)
- [ ] fast semantic search (potentially just dot product on quantized embeddings)
- [ ] fast network viz (WASM?)
- [ ] visualize interaction networks efficiently and filter by metadata (eg time, distance to 1+ users, etc)
- [ ] animate diffusion of terms and semantic content over time
- [ ] named entity recognition
- [ ] event detection in time-series of tweets / embeddings
- [ ] interop:
  - [ ] filtering by metadata (time, author, etc) and by topic, and by semantic search

### milestones 
- 3 months: fast primitives: embeddings, clustering, network viz, semantic search, nert, event detection
- 6 months: use primitives to manually reveal certain known stories (e.g. the rise of jhana and jhourney; fractal nyc and its onboarding of irl friends onto twitter; 4 distinct waves of "postrats)
- 12 months: use learnings from above to iterate on human interfaces, suplementing with LLMs
- 18 months: keep iterating and provide the CA-adjacent scene with unprecedented group-introspection tools 

## matchmaking

- [ ] create a "personal description" from someone's tweets that can be used to model them.
  - [ ] this can be done by loading some or all tweets into LLM context and extracting e.g. 1.life experiences 2.stories 3. concepts 4.models 5.subcultures 6.descriptions of vibes inferred from writing style
  - [ ] next steps::
    - [ ] 1 call per topic cluster (a la birdseye)
    - [ ] named entity recognition
    - [ ] purpose-based personal descriptions for e.g.
      - [ ] explaining an argument in a personalized way,
      - [ ] delegating negotiation or coordination
      - [ ] matchmaking (delegating establishing compatibility with another party)
- [ ] interest matchmaker - match people with similar interests who don't know each other
- [ ] delegate negotiation - given a description of a desired outcome, ai clones can negotiate on behalf of the user and return proposals.
- [ ]
