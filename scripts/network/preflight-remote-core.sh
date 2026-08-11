#!/usr/bin/env bash
set -euo pipefail

: "${GROOT_RPC_URL:?Set GROOT_RPC_URL to the HTTPS or HTTP onion RPC endpoint}"
: "${GROOT_RPC_USER:?Set GROOT_RPC_USER}"
: "${GROOT_RPC_PASSWORD:?Set GROOT_RPC_PASSWORD}"
: "${GROOT_EXPECTED_CHAIN:?Set GROOT_EXPECTED_CHAIN to regtest, signet, test, or main}"

case "${GROOT_EXPECTED_CHAIN}" in
  regtest|signet|test|main)
    ;;
  *)
    echo "GROOT_EXPECTED_CHAIN must be regtest, signet, test, or main." >&2
    exit 1
    ;;
esac
[[ "${GROOT_RPC_USER}${GROOT_RPC_PASSWORD}" != *$'\n'* && "${GROOT_RPC_USER}${GROOT_RPC_PASSWORD}" != *$'\r'* ]] || {
  echo "RPC credentials cannot contain line breaks." >&2
  exit 1
}
[[ "${GROOT_RPC_USER}" != *:* ]] || { echo "RPC usernames cannot contain a colon." >&2; exit 1; }

auth_file="$(mktemp "${TMPDIR:-/tmp}/groot-rpc-auth.XXXXXX")"
response_file="$(mktemp "${TMPDIR:-/tmp}/groot-rpc-response.XXXXXX")"
cleanup() {
  rm -f -- "${auth_file}" "${response_file}"
}
trap cleanup EXIT
chmod 600 "${auth_file}" "${response_file}"
escaped_user="${GROOT_RPC_USER//\\/\\\\}"
escaped_user="${escaped_user//\"/\\\"}"
escaped_password="${GROOT_RPC_PASSWORD//\\/\\\\}"
escaped_password="${escaped_password//\"/\\\"}"
printf 'user = "%s:%s"\n' "${escaped_user}" "${escaped_password}" >"${auth_file}"

request='{"jsonrpc":"2.0","id":"groot-preflight","method":"getblockchaininfo","params":[]}'
curl_args=(--fail --silent --show-error --connect-timeout 10 --max-time 15 --max-filesize 16777216 --config "${auth_file}" --header 'content-type: application/json' --data-binary "$request" --output "${response_file}")

if [[ "$GROOT_RPC_URL" =~ ^http://([a-z2-7]{56}\.onion)(:[0-9]+)?(/.*)?$ ]]; then
  : "${GROOT_TOR_PROXY:=127.0.0.1:9050}"
  [[ "${GROOT_TOR_PROXY}" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || {
    echo "GROOT_TOR_PROXY must be a numeric IPv4 loopback SOCKS5 address." >&2
    exit 1
  }
  proxy_port="${BASH_REMATCH[1]}"
  (( proxy_port >= 1 && proxy_port <= 65535 )) || {
    echo "The Tor proxy port is invalid." >&2
    exit 1
  }
  curl "${curl_args[@]}" --socks5-hostname "$GROOT_TOR_PROXY" "$GROOT_RPC_URL"
elif [[ "$GROOT_RPC_URL" =~ ^https://[^/@]+(/.*)?$ ]]; then
  curl "${curl_args[@]}" "$GROOT_RPC_URL"
else
  echo "Remote RPC must use HTTPS or HTTP to a 56-character v3 .onion host." >&2
  exit 1
fi

chain="$(jq -r 'if .error == null then (.result.chain // empty) else empty end' "${response_file}")"
blocks="$(jq -r 'if .error == null then (.result.blocks // empty) else empty end' "${response_file}")"
[[ "${blocks}" =~ ^[0-9]+$ ]] || { echo "Bitcoin Core returned an invalid response." >&2; exit 1; }
[[ "${chain}" == "${GROOT_EXPECTED_CHAIN}" ]] || {
  echo "Bitcoin Core returned the wrong chain." >&2
  exit 1
}
printf 'Bitcoin Core reachable: chain=%s blocks=%s\n' "$chain" "$blocks"
