#!/usr/bin/env bash
set -euo pipefail

: "${GROOT_RPC_URL:?Set GROOT_RPC_URL to the HTTPS or HTTP onion RPC endpoint}"
: "${GROOT_RPC_USER:?Set GROOT_RPC_USER}"
: "${GROOT_RPC_PASSWORD:?Set GROOT_RPC_PASSWORD}"

request='{"jsonrpc":"2.0","id":"groot-preflight","method":"getblockchaininfo","params":[]}'
curl_args=(--fail --silent --show-error --max-time 30 --user "$GROOT_RPC_USER:$GROOT_RPC_PASSWORD" --header 'content-type: application/json' --data-binary "$request")

if [[ "$GROOT_RPC_URL" == http://*.onion:* || "$GROOT_RPC_URL" == http://*.onion ]]; then
  : "${GROOT_TOR_PROXY:=127.0.0.1:9050}"
  response="$(curl "${curl_args[@]}" --socks5-hostname "$GROOT_TOR_PROXY" "$GROOT_RPC_URL")"
elif [[ "$GROOT_RPC_URL" == https://* ]]; then
  response="$(curl "${curl_args[@]}" "$GROOT_RPC_URL")"
else
  echo "Remote RPC must use HTTPS or HTTP to a .onion host." >&2
  exit 1
fi

chain="$(jq -r '.result.chain // empty' <<<"$response")"
blocks="$(jq -r '.result.blocks // empty' <<<"$response")"
[[ -n "$chain" && -n "$blocks" ]] || { echo "Bitcoin Core returned an invalid response." >&2; exit 1; }
printf 'Bitcoin Core reachable: chain=%s blocks=%s\n' "$chain" "$blocks"
