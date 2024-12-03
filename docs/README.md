# Docs

- [API docs](./api-doc.md) how to download raw JSON data from storage, or query the database through the Supabase API.
- [Quickstart Jupyter notebook](https://colab.research.google.com/drive/109XOgTWj-sajpAYhDCNPfts5zvdkpi_s) that you can run in your browser. Shows how to fetch all tweets for a given user in Python, and do some basic analysis like find the most common used phrases, and plot the amount of likes over time.

### Code examples / demos

- Fetch a tweet by ID & display it
  - https://codepen.io/DefenderOfBasic/pen/OJKGdPx?editors=1010
 
## Ecosystem

Static site generators

- [Tweetback](https://github.com/tweetback/tweetback) given a twitter archive, generates a simple static site you can self host. [Live demo](https://www.zachleat.com/twitter/)
- [helgridly/canonize](https://github.com/helgridly/canonize) generate a static site as a "personal canon"

Misc

- [deepfates's python script](https://gist.github.com/deepfates/78c9515ec2c2f263d6a65a19dd10162d) to preprocess a twitter archive for LLM fine-tuning, or just viewing as markdown/in Obsidian. See [twitter thread on it](https://x.com/deepfates/status/1858234863587049678)
- [DefenderOfBasic/twitter-semantic-search](https://github.com/DefenderOfBasic/twitter-semantic-search) with CloudFlare backend. Given a twitter archive, generate embeddings, insert them into a cloud vector DB, and a simple frontend to search.

[Nitter](https://github.com/zedeus/nitter) is an open source twitter frontend. It doesn't host data but can be used to access twitter without being rate limited (how? because they cache stuff?) 
