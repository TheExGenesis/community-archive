# Roadmap

## Archive Infrastructure

- [ ] Implement tests for uploading and privacy
- [ ] Infrastructure for
- [ ] Embeddings infrastructure: create, store, and serve embeddings for each tweet
- [ ] Own your social graph: prompt users for contact info (email is included in archive), and display it in profile only to their mutuals.

# Shovel-ready prototype ideas

Memetics
Chat to archive and advanced search: Ask an AI agent complex questions about the archive and have it query it for you. E.g. “What are the top 10 people that both A and B replied to in 2023?” This includes semantic search as one of the tools the agent has access to.

(Bi-)Weekly Meme Report: A newsletter summarizing the discourse within the community. New memes, ideas, or simply topics that took up a lot of attention. What they were, where they came from, what broad positions were taken. Easier situational awareness without scrolling every day.

The Nooscope: A dashboard to track historical topic diffusion. It’s a natural next step from the weekly meme report. More of an investigative tool. It gives users control to dive into topics, make complex queries, visualize the diffusion of topic in a social network, or their dynamics in semantic space.

Coordination
Frame Translator: Translate a message from user A’s point of view to user B’s. Often people agree while using different language. The simplest version of this throws all (or a subset of) user A’s and B’s tweets + the message into an LLM context and shows the output. A more advanced version distills the relevant structure (assumptions, values, memories) from tweets and uses that to inform the translation.

Body-of-work Synthesiser: People often post insights and notes on disparate topics. Over time, they return to them but these are hard to aggregate and distill into coherent positions. Many people have asked for ways to explore their body of work or even turn it into a book or explorable website. (Birdseye is an early attempt)

AI agent-mediated matchmaking: Use people’s tweets to distill a personality with values, preferences. Have LLMs roleplay the users, and talk amongst themselves to find matches, resolve disputes, or create proposals for collaboration.
