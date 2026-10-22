#!/bin/sh
# design-sync full build: compile the Tailwind stylesheet (content includes the
# authored previews, so this must run before every converter build), then build.
set -e
pnpm exec tailwindcss -c .design-sync/tailwind.config.js -i .design-sync/tailwind.input.css -o .design-sync/.cache/ds.css --minify
node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --out ./ds-bundle "$@"
