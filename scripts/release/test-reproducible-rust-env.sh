#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd -P)"
helper="$repo_root/scripts/release/reproducible-rust-env.sh"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/groot-rust-remap.XXXXXX")"
fixture_root="$(cd "$fixture_root" && pwd -P)"
trap 'rm -rf "$fixture_root"' EXIT

fail() {
  echo "Rust path-remapping test failed: $1" >&2
  exit 1
}

binary_contains() {
  strings "$1" | awk -v needle="$2" 'index($0, needle) { found = 1 } END { exit !found }'
}

build_fixture() {
  local identity="$1"
  local machine_root="$fixture_root/$identity/Users/$identity"
  local source_root="$machine_root/source"
  local cargo_home="$machine_root/cargo"
  local cargo_source="$cargo_home/registry/src/example.invalid-0000000000000000/remap-fixture-0.1.0"
  local cargo_target="$machine_root/target"

  mkdir -p "$source_root/src" "$cargo_source/src" "$cargo_target/src"
  cat > "$source_root/src/main.rs" <<'EOF'
fn main() {
    println!("{}", file!());
}
EOF
  cp "$source_root/src/main.rs" "$cargo_source/src/main.rs"
  cp "$source_root/src/main.rs" "$cargo_target/src/main.rs"

  (
    local rust_flags
    unset RUSTFLAGS CARGO_ENCODED_RUSTFLAGS
    export CARGO_HOME="$cargo_home"
    # shellcheck source=scripts/release/reproducible-rust-env.sh
    source "$helper"
    configure_reproducible_rust_env "$source_root" "$cargo_target"
    IFS=$'\x1f' read -r -a rust_flags <<< "$CARGO_ENCODED_RUSTFLAGS"
    rustc "${rust_flags[@]}" -C opt-level=3 "$source_root/src/main.rs" \
      -o "$fixture_root/source-$identity"
    rustc "${rust_flags[@]}" -C opt-level=3 "$cargo_source/src/main.rs" \
      -o "$fixture_root/cargo-$identity"
    rustc "${rust_flags[@]}" -C opt-level=3 "$cargo_target/src/main.rs" \
      -o "$fixture_root/target-$identity"
  )
}

write_invalid_fixture() {
  local root="$1"
  mkdir -p "$root/src"
  cat > "$root/Cargo.toml" <<'EOF'
[package]
name = "remap-fixture"
version = "0.1.0"
edition = "2024"
EOF
  cat > "$root/src/main.rs" <<'EOF'
fn main() {}
EOF
}

invalid_root="$fixture_root/invalid"
write_invalid_fixture "$invalid_root"
mkdir -p "$fixture_root/invalid-cargo"
mkdir -p "$fixture_root/invalid-target"
if env CARGO_HOME="$fixture_root/invalid-cargo" RUSTFLAGS= bash -c 'source "$1"; configure_reproducible_rust_env "$2" "$3"' bash "$helper" "$invalid_root" "$fixture_root/invalid-target" 2>/dev/null; then
  fail "an externally defined RUSTFLAGS was accepted"
fi
if env CARGO_HOME="$fixture_root/invalid-cargo" CARGO_ENCODED_RUSTFLAGS= bash -c 'source "$1"; configure_reproducible_rust_env "$2" "$3"' bash "$helper" "$invalid_root" "$fixture_root/invalid-target" 2>/dev/null; then
  fail "an externally defined CARGO_ENCODED_RUSTFLAGS was accepted"
fi

build_fixture alice
build_fixture bob

for location in source cargo target; do
  for identity in alice bob; do
    if binary_contains "$fixture_root/$location-$identity" "$fixture_root"; then
      fail "the physical fixture root survived in the $location executable"
    fi
    if binary_contains "$fixture_root/$location-$identity" "/Users/$identity"; then
      fail "the host identity $identity survived in the $location executable"
    fi
  done
done
binary_contains "$fixture_root/source-alice" '/groot/source/src/main.rs' \
  || fail "the stable source prefix is absent from the executable"
binary_contains "$fixture_root/source-bob" '/groot/source/src/main.rs' \
  || fail "the stable source prefix is absent from the second executable"
binary_contains "$fixture_root/cargo-alice" '/groot/cargo/registry/src/' \
  || fail "the stable Cargo-home prefix is absent from the executable"
binary_contains "$fixture_root/cargo-bob" '/groot/cargo/registry/src/' \
  || fail "the stable Cargo-home prefix is absent from the second executable"
binary_contains "$fixture_root/target-alice" '/groot/target/src/main.rs' \
  || fail "the stable Cargo-target prefix is absent from the executable"
binary_contains "$fixture_root/target-bob" '/groot/target/src/main.rs' \
  || fail "the stable Cargo-target prefix is absent from the second executable"

echo "Rust release paths are remapped and external Rust flags fail closed."
