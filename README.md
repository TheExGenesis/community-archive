# 🔖 Community Archive

Deployed at: https://www.community-archive.org/

> We believe there is immense value in preserving the history of subcultures on twitter. While Twitter charges exorbitantly for convenient access to our own data, we are getting people to request and download their data, and upload it to a common archive!

_from Xiq's [Towards data sovereignty, and a backup of the twitter canon](https://xiqo.substack.com/p/upload-to-the-community-archive)_.

The goals of this project are (1) create a public domain dataset so that we can analyze & build apps on top of our own data, commercial or otherwise (2) develop an open workflow for archival that people can self host or create private archives for their communities if they wish.

## Join our Discord

https://discord.gg/AStSQj6ugq

## App showcase

|  | | |
| ------------- | ------------- | ------------- |
| <a href="https://labs-community-archive.streamlit.app/"><img src="https://github.com/user-attachments/assets/39269a8e-e675-4040-9b71-f04c811ca304" width="350" /></a>  | [link](https://labs-community-archive.streamlit.app/)  | "google trends" like app but for twitter data


## How to use the API (from your own app)

See [API docs](docs/api-doc.md) for how to access the archive's supabase DB.

We have manual data dumps right now, see: https://github.com/TheExGenesis/community-archive/releases/tag/dump. Working on automating publishing of snapshots, see: https://github.com/TheExGenesis/community-archive/issues/59

## Development Instructions

See [local setup](docs/local-setup.md).

## Contributing

We welcome all contributions! Contribute to the code, or upload your archive, clone it & try it locally, join our discord & give us feedback or ideas.

## Roadmap

See our detailed [Roadmap](docs/roadmap.md) for planned features and improvements.

**Key focus areas:**

Infra

- [ ] Browser extension for DB updates via Twitter client API scraping
- [ ] Storing and making embeddings for semantic search
- [ ] more ...

Apps

- [ ] Websim-style app for exploring the data with dynamic UI and analysis
- [ ] User summary pages (interests, projects, relationships)
- [ ] Discourse mapping
- [ ] much more ...
