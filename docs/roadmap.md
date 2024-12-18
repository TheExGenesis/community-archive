# Roadmap

## Archive Infrastructure

- [x] S3 storage for archives, and API to serve it
- [x] Archive filtering and privacy settings
- [x] Postgres DB for pooled archives, and API to serve it
- [x] Row-level security
- [ ] Small fixes:
  - [ ] Split archive.json into files and chunks for convenient storage
  - [ ] Download and store avatars
  - [ ] Move from multiple archive_uploads to a single one
- [ ] Implement tests for uploading and privacy
- [ ] Embeddings infrastructure:
  - [ ] Create and store embeddings
    - [ ] using people's openai api key or letting them pay us to do it
  - [ ] Develop economics model for user charging
- [ ] Browser extension for DB updates via Twitter client API scraping
- [ ] Own your social graph: prompt users for contact info (email is included in archive), and display it in profile only to their mutuals.

## Apps Using the Data

- [x] Website
  - [x] Twitter-like advanced full text search
  - [x] User pages with top tweets and a button to copy as text (to put in LLM context)
- [x] Keyword and concept trends analysis
- [ ] Website improvements:
  - [x] Restyle front page
  - [ ] Render threads
- [ ] Birdseye: personal archive insights (topic clustering app)
- [ ] Train the tpot LLM and give it a twitter account
- [ ] Semantic search
- [ ] User summary pages (interests, projects, relationships)
- [ ] Discourse mapping
- [ ] Discussion reranking with bridging algorithms
- [ ] GraphRAG on whole db
- [ ] Interactions network visualization and temporal analysis
