# 🔖 Community Archive

Deployed at: https://www.community-archive.org/

> We believe there is immense value in preserving the history of subcultures on twitter. While Twitter charges exorbitantly for convenient access to our own data, we are getting people to request and download their data, and upload it to a common archive!

_from Xiq's [Towards data sovereignty, and a backup of the twitter canon](https://xiqo.substack.com/p/upload-to-the-community-archive)_.

The goals of this project are (1) create a public domain dataset so that we can analyze & build apps on top of our own data, commercial or otherwise (2) develop an open workflow for archival that people can self host or create private archives for their communities if they wish.

## How to use the API (from your own app)

See [API docs](docs/api-doc.md) for how to access the archive's supabase DB.

See also this [Google colab notebook](https://colab.research.google.com/drive/109XOgTWj-sajpAYhDCNPfts5zvdkpi_s) for an example you can run in your browser that fetches tweets from the archive for a specific user and runs some basic analysis.

## Development Instructions

See [local setup](docs/local-setup.md).

## Contributing

We welcome all contributions! Contribute to the code, or upload your archive, clone it & try it locally, join our discord & give us feedback or ideas.

## Privacy

We take your privacy seriously. When you upload your Twitter archive:

- Data is processed locally on your device
- Only essential information is sent to our servers
- No personal messages or sensitive data are uploaded

For a detailed list of what data we use and why, see [archive_data.md](docs/archive_data.md).
