# Pinned tweet-plaintext helpers

These three files are byte-for-byte copies of the maintained implementation
behind the `tweet-plaintext` skill. `source.json` records the source repository,
commit, paths, and SHA-256 checksums. Update them together from a reviewed source
commit; keep bulletin-specific policy and prompt assembly in `tweet_context.py`.

The worker calls normalization, selection, and rendering directly. It does not
call the CLI or image-description functions. Bundling makes an immutable worker
release independent of an operator's local skill installation and needs no new
runtime packages. The source helpers are maintained in the same organization's
Community Archive control-panel repository.
