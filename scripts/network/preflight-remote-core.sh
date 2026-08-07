#!/usr/bin/env bash
set -euo pipefail

: "${SATCHEL_RPC_URL:?Set SATCHEL_RPC_URL to the HTTPS or HTTP onion RPC endpoint}"
: "${SATCHEL_RPC_USER:?Set SATCHEL_RPC_USER}"
: "${SATCHEL_RPC_PASSWORD:?Set SATCHEL_RPC_PASSWORD}"

request='{"jsonrpc":"2.0","id":"satchel-preflight","method":"getblockchaininfo","params":[]}'
curl_args=(--fail --silent --show-error --max-time 30 --user "$SATCHEL_RPC_USER:$SATCHEL_RPC_PASSWORD" --header 'content-type: application/json' --data-binary "$request")

if [[ "$SATCHEL_RPC_URL" == http://*.onion:* || "$SATCHEL_RPC_URL" == http://*.onion ]]; then
  : "${SATCHEL_TOR_PROXY:=127.0.0.1:9050}"
  response="$(curl "${curl_args[@]}" --socks5-hostname "$SATCHEL_TOR_PROXY" "$SATCHEL_RPC_URL")"
elif [[ "$SATCHEL_RPC_URL" == https://* ]]; then
  response="$(curl "${curl_args[@]}" "$SATCHEL_RPC_URL")"
else
  echo "Remote RPC must use HTTPS or HTTP to a .onion host." >&2
  exit 1
fi

chain="$(jq -r '.result.chain // empty' <<<"$response")"
blocks="$(jq -r '.result.blocks // empty' <<<"$response")"
[[ -n "$chain" && -n "$blocks" ]] || { echo "Bitcoin Core returned an invalid response." >&2; exit 1; }
printf 'Bitcoin Core reachable: chain=%s blocks=%s\n' "$chain" "$blocks"
