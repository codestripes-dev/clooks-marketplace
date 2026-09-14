#!/usr/bin/env bash
set -euo pipefail

# Clooks runtime installer — called by /clooks:setup.
#
# Reuses an executable PATH binary first, then $HOME/.local/bin/clooks.
# Fresh installs and explicit managed updates verify release checksums.
# Only fresh installs append a sentinel-guarded PATH block to the shell rc.
#
# Usage: install.sh [install|update|check|resolve]
#
# Env:
#   CLOOKS_VERSION   Pin a specific release tag (e.g. "1.2.3" or "v1.2.3").
#                    Defaults to the latest non-prerelease.

# ---- Config (constants) -----------------------------------------------------

REPO="codestripes-dev/clooks"
INSTALL_DIR="$HOME/.local/bin"
MARKER="# clooks (added by /clooks:setup)"

# Override the release server for isolated installer tests.
BASE_URL="${CLOOKS_INSTALL_BASE_URL:-https://github.com/${REPO}/releases}"

# ---- Helpers ----------------------------------------------------------------

info() { printf 'clooks-install: %s\n' "$*"; }
err()  { printf 'clooks-install: error: %s\n' "$*" >&2; }

usage() {
  printf 'usage: install.sh [install|update|check|resolve]\n' >&2
}

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

# Return 2 only for absence; a broken managed installation must not be replaced
# implicitly. type -P ignores shell functions and finds executable PATH files.
select_binary() {
  SELECTED_BIN="$(type -P clooks || true)"
  SELECTED_ON_PATH=true
  if [[ -z "$SELECTED_BIN" ]]; then
    SELECTED_ON_PATH=false
    SELECTED_BIN="$INSTALL_DIR/clooks"
    if [[ ! -e "$SELECTED_BIN" && ! -L "$SELECTED_BIN" ]]; then
      return 2
    fi
  fi
  if [[ ! -f "$SELECTED_BIN" || ! -x "$SELECTED_BIN" ]]; then
    err "not an executable binary: $SELECTED_BIN; repair it or explicitly update the managed installation"
    return 1
  fi
  SELECTED_BIN="$(cd "$(dirname "$SELECTED_BIN")" && pwd -P)/$(basename "$SELECTED_BIN")"
}

validate_binary() {
  local binary="$1" requested version_pattern
  if ! SELECTED_VERSION="$("$binary" --version)"; then
    err "--version failed for $binary; repair it or request an explicit update"
    return 1
  fi
  version_pattern='^(clooks[[:blank:]]+)?v?([0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?)$'
  if [[ ! "$SELECTED_VERSION" =~ $version_pattern ]]; then
    err "invalid --version output from $binary: $SELECTED_VERSION"
    return 1
  fi
  SELECTED_VERSION="${BASH_REMATCH[2]}"
  requested="${CLOOKS_VERSION:-latest}"
  requested="${requested#v}"
  if [[ "$requested" != latest && "$requested" != "$SELECTED_VERSION" ]]; then
    err "requested $requested but $binary reports $SELECTED_VERSION; use explicit update, not install, to change versions"
    return 1
  fi
}

warn_path() {
  if [[ "$SELECTED_ON_PATH" != true ]]; then
    printf 'clooks-install: warning: %s is installed but unavailable on this process PATH. Correct the agent PATH and relaunch if needed; init alone does not establish hook readiness.\n' "$SELECTED_BIN" >&2
  fi
}

do_resolve() {
  if ! select_binary; then
    err "cannot resolve Clooks; run explicit install or repair the selected installation"
    return 1
  fi
  validate_binary "$SELECTED_BIN" || return 1
  warn_path
  printf '%s\n' "$SELECTED_BIN"
}

do_check() {
  local status=0
  printf 'clooks health check\n'
  printf '===================\n'
  if select_binary; then
    if validate_binary "$SELECTED_BIN"; then
      printf 'ok binary: %s\n  version: %s\n' "$SELECTED_BIN" "$SELECTED_VERSION"
      warn_path
    else
      status=1
    fi
  else
    err "binary missing or unusable"
    status=1
  fi

  if [[ -f ".clooks/clooks.yml" ]]; then
    printf 'ok project: .clooks/clooks.yml\n'
  else
    printf -- '-- project: no .clooks/clooks.yml\n'
  fi
  return "$status"
}

do_install() {
  local status
  if select_binary; then
    validate_binary "$SELECTED_BIN" || return 1
    info "reusing $SELECTED_BIN ($SELECTED_VERSION); no download or shell profile changes"
    warn_path
    return 0
  else
    status=$?
    if [[ "$status" != 2 ]]; then return "$status"; fi
  fi
  do_download true
}

do_update() {
  local managed
  # An external PATH selection wins even when a managed copy also exists.
  if select_binary; then
    if [[ -d "$INSTALL_DIR" ]]; then
      managed="$(cd "$INSTALL_DIR" && pwd -P)/clooks"
    else
      managed="$INSTALL_DIR/clooks"
    fi
    if [[ "$SELECTED_BIN" != "$managed" ]]; then
      err "selected external installation: $SELECTED_BIN; update through its installation method. Refusing to overwrite it or install a shadow copy"
      return 1
    fi
  fi
  if [[ -L "$INSTALL_DIR/clooks" ]]; then
    err "managed path is a symlink; update through its installation method instead"
    return 1
  fi
  do_download false
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

do_download() {
  local fresh="$1"
  if [[ -e "$INSTALL_DIR/clooks" && ! -f "$INSTALL_DIR/clooks" ]]; then
    err "managed destination is not a regular file: $INSTALL_DIR/clooks"
    return 1
  fi
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
  mkdir -p "$INSTALL_DIR"
  TMP_SUM=""
  TMP_BIN=""
  trap 'rm -f -- "$TMP_SUM" "$TMP_BIN"' EXIT
  TMP_SUM="$(mktemp)"
  TMP_BIN="$(mktemp "$INSTALL_DIR/.clooks-download.XXXXXX")"
  local tmpsum="$TMP_SUM" tmpbin="$TMP_BIN"

  # Fetch checksums first. If /latest/ changes between requests, mismatched
  # bytes fail verification rather than replacing the installed binary.
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

  # Validate before replacing the old binary. Stage on the destination filesystem
  # so the final rename is atomic even when TMPDIR is on another filesystem.
  chmod +x "$tmpbin"
  validate_binary "$tmpbin"

  if ! mv "$tmpbin" "$INSTALL_DIR/clooks"; then
    err "failed to move binary into place at $INSTALL_DIR/clooks"
    exit 1
  fi
  info "installed $SELECTED_VERSION to $INSTALL_DIR/clooks"

  # Sentinel-guarded rc edit. Never fails the overall install.
  if [[ "$fresh" == true ]]; then update_path_rc "$os"; fi

  info ""
  info "next steps:"
  info "  - ensure the agent's PATH includes $INSTALL_DIR; relaunch the agent with corrected PATH if needed"
  info "  - shell profile edits or child-shell exports do not repair the running agent's PATH"
  info "  - verify with: clooks --help"
  info "  - initialize a project: cd /your/project && clooks init"

  return 0
}

# ---- Dispatch ---------------------------------------------------------------

ACTION="${1:-install}"
case "$ACTION" in
  install)        do_install ;;
  update)         do_update ;;
  check)          do_check ;;
  resolve)        do_resolve ;;
  *)
    usage
    exit 1
    ;;
esac
