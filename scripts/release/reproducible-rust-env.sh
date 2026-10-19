#!/usr/bin/env bash

# Configure Rust path remapping for release evidence builds. This file is
# sourced so the exported flags apply to every Cargo/rustc process launched by
# the caller.
configure_reproducible_rust_env() {
  local source_root="$1"
  local cargo_target="$2"
  local cargo_home
  local source_root_logical
  local cargo_home_logical
  local cargo_target_logical
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
  source_root_logical="$(cd "$source_root" && pwd -L)"
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
  cargo_home_logical="$(cd "$cargo_home" && pwd -L)"
  cargo_home="$(cd "$cargo_home" && pwd -P)"

  if [[ "$cargo_target" != /* || ! -d "$cargo_target" ]]; then
    echo "Release evidence builds require an absolute existing Cargo target directory." >&2
    return 1
  fi
  cargo_target_logical="$(cd "$cargo_target" && pwd -L)"
  cargo_target="$(cd "$cargo_target" && pwd -P)"

  if [[ "$source_root_logical" == *$'\n'* || "$source_root" == *$'\n'* || \
        "$cargo_home_logical" == *$'\n'* || "$cargo_home" == *$'\n'* || \
        "$cargo_target_logical" == *$'\n'* || "$cargo_target" == *$'\n'* || \
        "$source_root_logical" == *$'\x1f'* || "$source_root" == *$'\x1f'* || \
        "$cargo_home_logical" == *$'\x1f'* || "$cargo_home" == *$'\x1f'* || \
        "$cargo_target_logical" == *$'\x1f'* || "$cargo_target" == *$'\x1f'* ]]; then
    echo "Release evidence build paths contain unsupported control characters." >&2
    return 1
  fi

  encoded_separator=$'\x1f'
  encoded_flags="--remap-path-scope=all"
  encoded_flags+="${encoded_separator}--remap-path-prefix=${source_root_logical}=/groot/source"
  if [[ "$source_root" != "$source_root_logical" ]]; then
    encoded_flags+="${encoded_separator}--remap-path-prefix=${source_root}=/groot/source"
  fi
  encoded_flags+="${encoded_separator}--remap-path-prefix=${cargo_home_logical}=/groot/cargo"
  if [[ "$cargo_home" != "$cargo_home_logical" ]]; then
    encoded_flags+="${encoded_separator}--remap-path-prefix=${cargo_home}=/groot/cargo"
  fi
  encoded_flags+="${encoded_separator}--remap-path-prefix=${cargo_target_logical}=/groot/target"
  if [[ "$cargo_target" != "$cargo_target_logical" ]]; then
    encoded_flags+="${encoded_separator}--remap-path-prefix=${cargo_target}=/groot/target"
  fi
  if [[ "$(uname -s)" == "Darwin" ]]; then
    encoded_flags+="${encoded_separator}-C${encoded_separator}link-arg=-Wl,-reproducible"
  fi
  export CARGO_ENCODED_RUSTFLAGS="$encoded_flags"
}

assert_no_unremapped_paths() {
  local executable="$1"
  shift
  local forbidden_path
  local grep_status
  local strings_file

  if [[ ! -f "$executable" || $# -eq 0 ]]; then
    echo "Release path scan requires an executable and at least one forbidden path." >&2
    return 1
  fi
  strings_file="$(mktemp "${TMPDIR:-/tmp}/groot-release-strings.XXXXXX")" || {
    echo "Release path scan could not create its temporary file." >&2
    return 1
  }
  if ! strings "$executable" > "$strings_file"; then
    rm -f "$strings_file"
    echo "Release path scan could not inspect the executable." >&2
    return 1
  fi
  for forbidden_path in "$@"; do
    if [[ -z "$forbidden_path" ]]; then
      rm -f "$strings_file"
      echo "Release path scan received an empty forbidden path." >&2
      return 1
    fi
    if grep -F -q -- "$forbidden_path" "$strings_file"; then
      rm -f "$strings_file"
      echo "Release executable contains an unremapped host path." >&2
      return 1
    else
      grep_status=$?
      if [[ "$grep_status" -ne 1 ]]; then
        rm -f "$strings_file"
        echo "Release path scan could not search the executable strings." >&2
        return 1
      fi
    fi
  done
  rm -f "$strings_file"
}
