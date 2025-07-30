# Roadmap

## Archive Infrastructure

- [x] S3 storage for archives, and API to serve it
- [x] Archive filtering and privacy settings
- [x] Postgres DB for pooled archives, and API to serve it
- [x] Row-level security
- [ ] Small fixes:
  - [ ] Split archive.json into files and chunks for convenient storage
  - [ ] Download and store avatars
  - [x] Move from multiple archive_uploads to a single one
- [ ] Implement tests for uploading and privacy
- [ ] Embeddings infrastructure:
  - [ ] Create and store embeddings
    - [ ] using people's openai api key or letting them pay us to do it
  - [ ] Develop economics model for user charging
- [x] Browser extension for DB updates via Twitter client API scraping
- [ ] Own your social graph: prompt users for contact info (email is included in archive), and display it in profile only to their mutuals.

## Apps Using the Data

- [x] Website
  - [x] Twitter-like advanced full text search
  - [x] User pages with top tweets and a button to copy as text (to put in LLM context)
  - [ ] if a person has tweets from before circle tweets were discontinued, show a message when uploading that makes it very clear that circle tweets are uploaded,
  - [ ] render images in tweets,
  - [ ] show a paginated reverse chronological view of all tweets in the archive - add that to user pages,
  - [ ] recent user pages don’t have content bc we stopped calculating stats bc it was too heavy on the db - make the page look nice despite lacking stats,
  - [ ] make website not broken on mobile,
  - [ ] show some archive wide stats like a histogram of all the tweets,
  - [ ] show opencollective contributors at the bottom of the front page,
  - [ ] maybe showcase some apps in the front page, like Birdseye and trends,
  - [ ] link the archive_data docs page in the home page to make it extremely clear what data we use,
  - [ ] go around the site and note down stuff you think should be different
- [x] Keyword and concept trends analysis
- [ ] Website improvements:
  - [x] Restyle front page
  - [ ] Render threads
- [x] Birdseye: personal archive insights (topic clustering app)
- [ ] Train the tpot LLM and give it a twitter account
- [ ] Semantic search
- [ ] User summary pages (interests, projects, relationships)
- [ ] Discourse mapping
- [ ] Discussion reranking with bridging algorithms
- [ ] GraphRAG on whole db
- [ ] Interactions network visualization and temporal analysis
