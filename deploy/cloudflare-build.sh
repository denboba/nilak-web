#!/usr/bin/env bash
# Nilak Web on Cloudflare: builds the site into `dist` on every push (Cloudflare installs dependencies first).
# Cloudflare settings: build command `bash deploy/cloudflare-build.sh`, deploy command `npx wrangler deploy`
# (see `wrangler.jsonc`), variables TELEGRAM_API_ID, TELEGRAM_API_HASH, APP_NAME=Nilak
set -euo pipefail
npm run build:production
# The build report is far above Cloudflare's 25 MB per-file limit and is not part of the site
rm -f dist/build-stats.json
