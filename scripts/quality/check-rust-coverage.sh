#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A new Rust module must be classified deliberately instead of silently
# entering or disappearing from the security-core percentage.
core_modules=(
  auth.rs
  bsms.rs
  build_network.rs
  external_signer.rs
  multisig.rs
  notifications.rs
  privacy_selection.rs
  proposal.rs
  recovery.rs
  release_policy.rs
  session.rs
  ur_transport.rs
)

adapter_modules=(
  airgap.rs
  direct_rpc.rs
  hardware.rs
  label_provenance.rs
  lib.rs
  main.rs
  native_backup.rs
  network.rs
  process_lock.rs
  registry.rs
  secure_store.rs
  tor_rpc.rs
  wallet.rs
)

contains_module() {
  local candidate="$1"
  shift
  local module
  for module in "$@"; do
    [[ "$module" == "$candidate" ]] && return 0
  done
  return 1
}

while IFS= read -r source; do
  module="${source##*/}"
  if ! contains_module "$module" "${core_modules[@]}" && ! contains_module "$module" "${adapter_modules[@]}"; then
    echo "Rust coverage scope failed: classify src-tauri/src/$module as deterministic core or adapter/orchestration." >&2
    exit 1
  fi
done < <(find src-tauri/src -maxdepth 1 -type f -name '*.rs' | sort)

echo "Enforcing deterministic Rust core: ${core_modules[*]}"
echo "Reporting adapters separately through whole-library coverage: ${adapter_modules[*]}"

adapter_pattern="src/(airgap|direct_rpc|hardware|label_provenance|lib|main|native_backup|network|process_lock|registry|secure_store|tor_rpc|wallet)\\.rs$"
cargo llvm-cov \
  --locked \
  --manifest-path src-tauri/Cargo.toml \
  --lib \
  --summary-only \
  --ignore-filename-regex "$adapter_pattern" \
  --fail-under-lines 99 \
  --fail-under-functions 100 \
  --fail-under-regions 97
