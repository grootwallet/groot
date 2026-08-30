#!/usr/bin/env bash

# Configure Rust path remapping for release evidence builds. This file is
# sourced so the exported flags apply to every Cargo/rustc process launched by
# the caller.
configure_reproducible_rust_env() {
  local source_root="$1"
  local cargo_target="$2"
  local cargo_home
  local encoded_flags
  local encoded_separator

  if [[ -n "${RUSTFLAGS+x}" || -n "${CARGO_ENCODED_RUSTFLAGS+x}" ]]; then
    echo "Release evidence builds reject external RUSTFLAGS and CARGO_ENCODED_RUSTFLAGS." >&2
    return 1
  fi
  # Apple ld includes this ambient release-train salt in its otherwise
  # content-derived LC_UUID. It is not a source input and can differ between
  # build hosts, so release evidence builds must remove it before linking.
  unset RC_UUID_SALT
  if [[ "$source_root" != /* || ! -d "$source_root" ]]; then
    echo "Release evidence builds require an absolute existing source root." >&2
    return 1
  fi
  source_root="$(cd "$source_root" && pwd -P)"

  if [[ -n "${CARGO_HOME:-}" ]]; then
    cargo_home="$CARGO_HOME"
  else
    if [[ -z "${HOME:-}" ]]; then
      echo "Release evidence builds require HOME or CARGO_HOME." >&2
      return 1
    fi
    cargo_home="$HOME/.cargo"
  fi
  if [[ "$cargo_home" != /* || ! -d "$cargo_home" ]]; then
    echo "Release evidence builds require an absolute existing Cargo home." >&2
    return 1
  fi
  cargo_home="$(cd "$cargo_home" && pwd -P)"

  if [[ "$cargo_target" != /* || ! -d "$cargo_target" ]]; then
    echo "Release evidence builds require an absolute existing Cargo target directory." >&2
    return 1
  fi
  cargo_target="$(cd "$cargo_target" && pwd -P)"

  if [[ "$source_root" == *$'\n'* || "$cargo_home" == *$'\n'* || "$cargo_target" == *$'\n'* || \
        "$source_root" == *$'\x1f'* || "$cargo_home" == *$'\x1f'* || "$cargo_target" == *$'\x1f'* ]]; then
    echo "Release evidence build paths contain unsupported control characters." >&2
    return 1
  fi

  encoded_separator=$'\x1f'
  encoded_flags="--remap-path-prefix=${source_root}=/groot/source${encoded_separator}--remap-path-prefix=${cargo_home}=/groot/cargo${encoded_separator}--remap-path-prefix=${cargo_target}=/groot/target"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    encoded_flags+="${encoded_separator}-C${encoded_separator}link-arg=-Wl,-reproducible"
  fi
  export CARGO_ENCODED_RUSTFLAGS="$encoded_flags"
}
