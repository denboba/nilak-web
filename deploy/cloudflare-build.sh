#!/usr/bin/env bash
# Nilak Web on Cloudflare: builds the site into `dist`.
# Runs from `wrangler deploy` (see `wrangler.jsonc`); Cloudflare installs dependencies first.
# Build variables: TELEGRAM_API_ID, TELEGRAM_API_HASH, APP_NAME=Nilak
set -euo pipefail
npm run build:production
# The build report is far above Cloudflare's 25 MB per-file limit and is not part of the site
rm -f dist/build-stats.json
