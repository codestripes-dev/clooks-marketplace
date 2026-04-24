#!/usr/bin/env bash
set -euo pipefail

# Clooks runtime installer — called by /clooks:setup.
#
# Downloads a prebuilt binary from GitHub Releases, verifies SHA-256 against
# the release's checksums.txt, installs to $HOME/.local/bin/clooks, and
# appends a sentinel-guarded PATH-export block to the user's shell rc.
#
# Usage: install.sh [install|update|check]
#
# Env:
#   CLOOKS_VERSION   Pin a specific release tag (e.g. "1.2.3" or "v1.2.3").
#                    Defaults to the latest non-prerelease.

# ---- Config (constants) -----------------------------------------------------

REPO="codestripes-dev/clooks"
INSTALL_DIR="$HOME/.local/bin"
MARKER="# clooks (added by /clooks:setup)"

# Test-only hook: allow the test harness to point at a local fixture server.
# NOT user-facing; intentionally undocumented in --help / postamble output.
BASE_URL="${CLOOKS_INSTALL_BASE_URL:-https://github.com/${REPO}/releases}"

# ---- Helpers ----------------------------------------------------------------

info() { printf 'clooks-install: %s\n' "$*"; }
err()  { printf 'clooks-install: error: %s\n' "$*" >&2; }

usage() {
  printf 'usage: install.sh [install|update|check]\n' >&2
}

# Detect OS token (darwin|linux). Exits 1 on anything else.
detect_os() {
  local kernel
  kernel="$(uname -s)"
  case "$kernel" in
    Darwin) printf 'darwin' ;;
    Linux)  printf 'linux' ;;
    *)
      err "unsupported operating system: $kernel (only darwin and linux are supported)"
      exit 1
      ;;
  esac
}

# Detect arch token (arm64|x64). Exits 1 on anything else.
detect_arch() {
  local machine
  machine="$(uname -m)"
  case "$machine" in
    arm64|aarch64) printf 'arm64' ;;
    x86_64|amd64)  printf 'x64' ;;
    *)
      err "unsupported architecture: $machine (only arm64 and x64 are supported)"
      exit 1
      ;;
  esac
}

# Compute SHA-256 of a file; prints the hex digest on stdout.
sha256_of() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    err "neither sha256sum nor shasum is available; cannot verify download"
    exit 1
  fi
}

# ---- Actions ----------------------------------------------------------------

do_check() {
  printf 'clooks health check\n'
  printf '===================\n'

  local binpath="$INSTALL_DIR/clooks"
  if [[ -x "$binpath" ]]; then
    printf 'ok binary: %s\n' "$binpath"
    printf '  version: %s\n' "$("$binpath" --version 2>/dev/null || echo unknown)"
  elif command -v clooks >/dev/null 2>&1; then
    local onpath
    onpath="$(command -v clooks)"
    printf 'ok binary: %s (on PATH)\n' "$onpath"
    printf '  version: %s\n' "$("$onpath" --version 2>/dev/null || echo unknown)"
  else
    printf 'MISSING binary: not found\n'
  fi

  if [[ -f ".clooks/clooks.yml" ]]; then
    printf 'ok project: .clooks/clooks.yml\n'
  else
    printf -- '-- project: no .clooks/clooks.yml\n'
  fi
  return 0
}

# Resolve the release URL prefix. Sets the global RELEASE_URL.
resolve_release_url() {
  local version="${CLOOKS_VERSION:-latest}"
  if [[ "$version" == "latest" ]]; then
    RELEASE_URL="${BASE_URL}/latest/download"
  else
    # Normalize to v-prefixed tag form (accept both "1.2.3" and "v1.2.3").
    local tag="$version"
    if [[ "$tag" != v* ]]; then
      tag="v${tag}"
    fi
    RELEASE_URL="${BASE_URL}/download/${tag}"
  fi
}

# Append the sentinel-guarded PATH block to $1 if the marker isn't already
# present. Second arg `allow_create` (default "true") controls whether the
# file will be created if it does not exist — macOS bash must never create
# .bashrc, so its caller passes "false".
append_rc_block() {
  local file="$1"
  local allow_create="${2:-true}"

  if [[ "$allow_create" != "true" && ! -e "$file" ]]; then
    return 0
  fi

  if grep -Fq "$MARKER" "$file" 2>/dev/null; then
    return 0
  fi

  # Append blank line + marker + export. `>>` creates the file if absent,
  # which is why `allow_create=false` short-circuits above.
  # SC2016: single quotes intentional — we want `$HOME` written as a literal
  # into the rc file so the user's shell expands it at source time.
  if ! {
    printf '\n'
    printf '%s\n' "$MARKER"
    # shellcheck disable=SC2016
    printf '%s\n' 'export PATH="$HOME/.local/bin:$PATH"'
  } >>"$file" 2>/dev/null; then
    return 1
  fi
  return 0
}

# Print the manual export line to the user as a fallback.
print_manual_export() {
  info "add this line to your shell rc to use clooks:"
  # SC2016: single quotes intentional — print the literal line for the user
  # to paste into their rc unchanged.
  # shellcheck disable=SC2016
  info '  export PATH="$HOME/.local/bin:$PATH"'
}

# Warn if a target rc file could not be written. Do not fail the whole
# install — the binary is already in place.
warn_rc_write_failed() {
  local file="$1"
  err "could not write to $file (permission denied or filesystem full)"
  print_manual_export
}

# Update the user's shell rc with the sentinel block. Per-file idempotent.
# Never fails the install; rc-edit problems downgrade to a warning.
# Arg 1: normalized os token (darwin|linux) — passed from do_install so we
# don't recompute `uname -s` here.
update_path_rc() {
  local os="$1"
  local shell_basename
  shell_basename="$(basename "${SHELL:-}")"

  case "$shell_basename" in
    zsh)
      local zshrc="${ZDOTDIR:-$HOME}/.zshrc"
      if ! append_rc_block "$zshrc"; then
        warn_rc_write_failed "$zshrc"
      fi
      ;;
    bash)
      if [[ "$os" == "darwin" ]]; then
        # macOS bash: always target .bash_profile (login-shell file sourced
        # by Terminal.app). Target .bashrc ONLY if it already exists —
        # never create it. The "never create" rule is enforced inside
        # append_rc_block via the allow_create=false argument.
        local bash_profile="$HOME/.bash_profile"
        if ! append_rc_block "$bash_profile"; then
          warn_rc_write_failed "$bash_profile"
        fi
        local bashrc="$HOME/.bashrc"
        if ! append_rc_block "$bashrc" false; then
          warn_rc_write_failed "$bashrc"
        fi
      else
        # Linux bash: .bashrc only.
        local bashrc="$HOME/.bashrc"
        if ! append_rc_block "$bashrc"; then
          warn_rc_write_failed "$bashrc"
        fi
      fi
      ;;
    *)
      info "detected shell '$shell_basename' — add the PATH export manually:"
      print_manual_export
      ;;
  esac
}

do_install() {
  if ! command -v curl >/dev/null 2>&1; then
    err "curl is required but was not found on PATH"
    exit 1
  fi

  local os arch asset
  os="$(detect_os)"
  arch="$(detect_arch)"
  asset="clooks-${os}-${arch}"

  resolve_release_url
  local binary_url="${RELEASE_URL}/${asset}"
  local checksums_url="${RELEASE_URL}/checksums.txt"

  info "installing ${asset}"
  info "source: ${RELEASE_URL}"

  # Temp files + single trap so any failure path cleans up. Because the
  # destination at $INSTALL_DIR/clooks is only written on the final mv,
  # a mid-flight failure leaves no partial binary visible to the user.
  local tmpsum tmpbin
  tmpsum="$(mktemp)"
  tmpbin="$(mktemp)"
  # shellcheck disable=SC2064 # expand tmp paths now so the trap sees them.
  trap "rm -f '$tmpsum' '$tmpbin'" EXIT

  # Fetch checksums FIRST, then the binary. This avoids a TOCTOU where the
  # /latest/ redirect resolves to different releases between the two calls.
  info "downloading checksums..."
  if ! curl -fsSL -o "$tmpsum" "$checksums_url"; then
    err "failed to download checksums from $checksums_url"
    exit 1
  fi
  if [[ ! -s "$tmpsum" ]]; then
    err "downloaded checksums file is empty"
    exit 1
  fi

  info "downloading binary..."
  if ! curl -fsSL -o "$tmpbin" "$binary_url"; then
    err "failed to download binary from $binary_url"
    exit 1
  fi
  if [[ ! -s "$tmpbin" ]]; then
    err "downloaded binary is empty"
    exit 1
  fi

  # Parse expected hash. checksums.txt lines look like:
  #   <hash>  clooks-linux-x64
  # Match the whole-word asset name at end of line; filter to one line.
  local expected
  expected="$(grep -E " +${asset}\$" "$tmpsum" | head -1 | awk '{print $1}' || true)"
  if [[ -z "$expected" ]]; then
    err "no checksum entry for $asset in checksums.txt"
    exit 1
  fi

  local actual
  actual="$(sha256_of "$tmpbin")"

  # Case-insensitive compare. `tr` is portable; `${var,,}` would require
  # Bash 4+, which macOS's stock /bin/bash (3.2) does not provide.
  local expected_lc actual_lc
  expected_lc="$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]')"
  actual_lc="$(printf '%s' "$actual" | tr '[:upper:]' '[:lower:]')"
  if [[ "$expected_lc" != "$actual_lc" ]]; then
    err "checksum mismatch for $asset"
    err "  expected: $expected"
    err "  actual:   $actual"
    exit 1
  fi

  info "checksum verified"

  # Install.
  if ! mkdir -p "$INSTALL_DIR"; then
    err "could not create $INSTALL_DIR"
    exit 1
  fi

  # mv is atomic within a filesystem; across filesystems it falls back to
  # copy+unlink. Either way the destination only appears once complete.
  if ! mv "$tmpbin" "$INSTALL_DIR/clooks"; then
    err "failed to move binary into place at $INSTALL_DIR/clooks"
    exit 1
  fi
  chmod +x "$INSTALL_DIR/clooks"

  # Clear the trap: tmpbin has been renamed, tmpsum will still be cleaned up
  # on EXIT below (which is fine — we reset the trap to only target tmpsum).
  # shellcheck disable=SC2064
  trap "rm -f '$tmpsum'" EXIT

  info "installed to $INSTALL_DIR/clooks"

  # Sentinel-guarded rc edit. Never fails the overall install.
  update_path_rc "$os"

  # Postamble.
  info ""
  info "next steps:"
  info "  - open a new terminal (or run: exec \$SHELL) to pick up PATH"
  info "  - verify with: clooks --help"
  info "  - initialize a project: cd /your/project && clooks init"

  return 0
}

# ---- Dispatch ---------------------------------------------------------------

ACTION="${1:-install}"
case "$ACTION" in
  install|update) do_install ;;
  check)          do_check ;;
  *)
    usage
    exit 1
    ;;
esac
