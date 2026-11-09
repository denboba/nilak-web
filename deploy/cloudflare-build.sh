#!/usr/bin/env bash
# Nilak Web on Cloudflare Pages: builds the site from source on every push.
# Cloudflare settings: build command `bash deploy/cloudflare-build.sh`, output folder `dist`,
# variables TELEGRAM_API_ID, TELEGRAM_API_HASH, APP_NAME=Nilak, BASE_URL=https://<your site>/
set -euo pipefail
npm install --no-audit --no-fund
npm run build:production
# The build report is far above Cloudflare's 25 MB per-file limit and is not part of the site
rm -f dist/build-stats.json
