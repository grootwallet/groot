#!/usr/bin/env bash
set +x
set -euo pipefail

if [[ ! -t 0 || ! -t 1 || ! -t 2 ]]; then
  printf 'Run this check in a local Terminal so the API key can be entered privately.\n' >&2
  exit 1
fi

printf 'LocalCoinSwap API key (hidden): ' >&2
if ! IFS= read -r -s GROOT_LOCALCOINSWAP_API_KEY; then
  printf '\nAccount check cancelled.\n' >&2
  exit 1
fi
printf '\n' >&2

if [[ ! $GROOT_LOCALCOINSWAP_API_KEY =~ ^lcs_[A-Za-z0-9_-]{3,252}$ ]]; then
  printf 'Enter the full LocalCoinSwap API key beginning with lcs_.\n' >&2
  exit 1
fi

GROOT_LOCALCOINSWAP_ACCESS_TOKEN="$(node -p "require('node:crypto').randomBytes(24).toString('hex')")"
export GROOT_LOCALCOINSWAP_API_KEY GROOT_LOCALCOINSWAP_ACCESS_TOKEN
export GROOT_LOCALCOINSWAP_MODE=account GROOT_LOCALCOINSWAP_TRADE_ACTIONS=0
unset GROOT_LOCALCOINSWAP_JOURNAL

printf '\nRead-only account check\n'
printf 'Open http://127.0.0.1:5312/marketplace/provider\n'
printf 'In Your trades, enter this local access code: %s\n\n' "$GROOT_LOCALCOINSWAP_ACCESS_TOKEN"

exec pnpm exec vite --mode regtest --port 5312
