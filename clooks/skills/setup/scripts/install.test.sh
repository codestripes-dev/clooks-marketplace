#!/usr/bin/env bash
# shellcheck disable=SC2016 # single-quoted literals appear in assertions
#
# Tests for install.sh.
#
# Run with: bash install.test.sh
# Requires: bash 4+, curl, python3, and either sha256sum or shasum.
#
# The harness spins up a local HTTP fixture server (python3 -m http.server)
# serving a fake clooks binary and a live-generated checksums.txt. It then
# runs install.sh with:
#   - HOME pointed at a temp dir
#   - SHELL set for the scenario under test (/bin/zsh or /bin/bash)
#   - CLOOKS_INSTALL_BASE_URL overridden to the fixture server
#   - PATH optionally prepended with a uname shim to simulate macOS
#
# The sentinel MARKER literal is read out of install.sh rather than re-
# encoded in this file, so the literal has one source of truth.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SH="$SCRIPT_DIR/install.sh"

# Single source of truth for the sentinel literal — read it out of install.sh.
MARKER="$(grep -oE '# clooks \(added by /clooks:setup\)' "$INSTALL_SH" | head -1)"
if [[ -z "$MARKER" ]]; then
  printf 'test setup failed: could not extract MARKER from %s\n' "$INSTALL_SH" >&2
  exit 1
fi

# Tally counters.
PASSED=0
FAILED=0

pass() {
  PASSED=$((PASSED + 1))
  printf '  ok    %s\n' "$1"
}

fail() {
  FAILED=$((FAILED + 1))
  printf '  FAIL  %s\n' "$1" >&2
}

banner() {
  printf '\n[%s]\n' "$1"
}

# assert_eq <actual> <expected> <label>
assert_eq() {
  if [[ "$1" == "$2" ]]; then
    pass "$3"
  else
    fail "$3: expected [$2], got [$1]"
  fi
}

# count_marker <file>: print the number of MARKER occurrences in the file.
count_marker() {
  if [[ ! -f "$1" ]]; then
    printf '0'
    return
  fi
  grep -cF "$MARKER" "$1" 2>/dev/null || printf '0'
}

# Portable sha256 for checksum fixtures. macOS has `shasum` not `sha256sum`;
# install.sh itself already handles both, so the harness must too.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  else
    shasum -a 256 "$1"
  fi
}

# ---- Fixture server ---------------------------------------------------------

# Detect host OS/arch tokens (the same way install.sh does) so the fixture
# binary's filename matches what the script will request. For the macOS
# fixture we inject a uname shim; uname -m still reports the real host arch,
# so the asset name under test is always clooks-<detected_os>-<host_arch>.
host_arch_token() {
  case "$(uname -m)" in
    arm64|aarch64) printf 'arm64' ;;
    x86_64|amd64)  printf 'x64' ;;
    *) printf 'unknown' ;;
  esac
}

FIXTURE_ROOT="$(mktemp -d)"
FIXTURE_PORT=""
FIXTURE_PID=""

# Build the fixture tree under FIXTURE_ROOT:
#   latest/download/clooks-<os>-<arch>   (fake binary: prints a --version stub)
#   latest/download/checksums.txt        (live-computed via sha256sum)
# For each OS case we rebuild the fake binary under the right name.
setup_fixture_files() {
  local os_token="$1"
  local arch_token
  arch_token="$(host_arch_token)"
  local asset="clooks-${os_token}-${arch_token}"

  local dir="$FIXTURE_ROOT/latest/download"
  rm -rf "$FIXTURE_ROOT/latest"
  mkdir -p "$dir"

  # Fake binary: a bash script that prints a stub --version string.
  cat >"$dir/$asset" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then
  printf 'clooks fake 0.0.0\n'
fi
EOF
  chmod +x "$dir/$asset"

  # Generate checksums.txt live (auto-repair if the stub changes).
  (cd "$dir" && sha256_of "$asset" >checksums.txt)

  printf '%s' "$asset"
}

start_fixture_server() {
  # Start python3 -m http.server on an ephemeral port. `-u` forces
  # unbuffered stderr so the harness can read the listening-port line
  # without a buffer-flush race.
  (cd "$FIXTURE_ROOT" && exec python3 -u -m http.server 0 >"$FIXTURE_ROOT/server.log" 2>&1) &
  FIXTURE_PID=$!

  # The server logs "Serving HTTP on 0.0.0.0 port NNNNN ..." once ready.
  local tries=0
  while [[ $tries -lt 100 ]]; do
    if grep -oE 'port [0-9]+' "$FIXTURE_ROOT/server.log" 2>/dev/null | head -1 >/dev/null; then
      FIXTURE_PORT="$(grep -oE 'port [0-9]+' "$FIXTURE_ROOT/server.log" | head -1 | awk '{print $2}')"
      break
    fi
    sleep 0.05
    tries=$((tries + 1))
  done
  if [[ -z "$FIXTURE_PORT" ]]; then
    printf 'fixture server failed to start; log:\n' >&2
    cat "$FIXTURE_ROOT/server.log" >&2
    exit 1
  fi
}

# shellcheck disable=SC2329 # invoked indirectly via EXIT trap.
stop_fixture_server() {
  if [[ -n "$FIXTURE_PID" ]] && kill -0 "$FIXTURE_PID" 2>/dev/null; then
    kill "$FIXTURE_PID" 2>/dev/null || true
    wait "$FIXTURE_PID" 2>/dev/null || true
  fi
  FIXTURE_PID=""
}

# shellcheck disable=SC2329 # invoked indirectly via EXIT trap.
cleanup_all() {
  stop_fixture_server
  rm -rf "$FIXTURE_ROOT"
}
trap cleanup_all EXIT

# ---- uname shim (for the macOS-bash fixture) --------------------------------

# Creates a tmp dir with a `uname` script that reports Darwin for -s and
# passes through all other args to the real uname. Returns the dir path.
make_uname_shim() {
  local shim_dir
  shim_dir="$(mktemp -d)"
  local real_uname
  real_uname="$(command -v uname)"
  cat >"$shim_dir/uname" <<EOF
#!/usr/bin/env bash
if [[ "\${1:-}" == "-s" ]]; then
  echo Darwin
else
  exec "$real_uname" "\$@"
fi
EOF
  chmod +x "$shim_dir/uname"
  printf '%s' "$shim_dir"
}

# Creates a tmp dir with a `uname` script that reports arbitrary values for
# -s and -m. Args: $1 = value for `uname -s`, $2 = value for `uname -m`.
# Either may be empty to pass through to the real uname.
make_uname_shim_custom() {
  local s_val="$1"
  local m_val="$2"
  local shim_dir
  shim_dir="$(mktemp -d)"
  local real_uname
  real_uname="$(command -v uname)"
  cat >"$shim_dir/uname" <<EOF
#!/usr/bin/env bash
case "\${1:-}" in
  -s)
    if [[ -n "$s_val" ]]; then echo "$s_val"; else exec "$real_uname" -s; fi
    ;;
  -m)
    if [[ -n "$m_val" ]]; then echo "$m_val"; else exec "$real_uname" -m; fi
    ;;
  *)
    exec "$real_uname" "\$@"
    ;;
esac
EOF
  chmod +x "$shim_dir/uname"
  printf '%s' "$shim_dir"
}

# ---- Test helpers -----------------------------------------------------------

# Run install.sh with the specified env. Returns its exit code.
# Args:
#   $1 HOME
#   $2 SHELL
#   $3 extra PATH prefix (empty string for none)
#   $4 action (install|update|check)
run_install() {
  local home_dir="$1"
  local shell_val="$2"
  local path_prefix="$3"
  local action="$4"

  local base_url="http://127.0.0.1:${FIXTURE_PORT}"
  local full_path="$PATH"
  if [[ -n "$path_prefix" ]]; then
    full_path="${path_prefix}:${PATH}"
  fi

  env -i \
    HOME="$home_dir" \
    SHELL="$shell_val" \
    PATH="$full_path" \
    CLOOKS_INSTALL_BASE_URL="$base_url" \
    bash "$INSTALL_SH" "$action"
}

# ---- Fixture 1: zsh happy path ---------------------------------------------

test_zsh_happy_path() {
  banner "fixture 1: zsh happy path"

  local asset
  asset="$(setup_fixture_files linux)"  # Linux is the likely harness OS.
  # If harness is macOS, adjust.
  if [[ "$(uname -s)" == "Darwin" ]]; then
    asset="$(setup_fixture_files darwin)"
  fi

  local home_dir
  home_dir="$(mktemp -d)"

  # Run 1: install.
  local rc=0
  run_install "$home_dir" "/bin/zsh" "" install >/dev/null 2>&1 || rc=$?
  assert_eq "$rc" "0" "first run exits 0"

  local bin="$home_dir/.local/bin/clooks"
  if [[ -x "$bin" ]]; then pass "binary installed and executable"
  else fail "binary not installed at $bin"
  fi

  local ver
  ver="$("$bin" --version 2>/dev/null || true)"
  assert_eq "$ver" "clooks fake 0.0.0" "binary --version output"

  local zshrc="$home_dir/.zshrc"
  local count
  count="$(count_marker "$zshrc")"
  assert_eq "$count" "1" ".zshrc has exactly one marker after first run"

  # Run 2: idempotence.
  run_install "$home_dir" "/bin/zsh" "" install >/dev/null 2>&1 || rc=$?
  assert_eq "$rc" "0" "second run exits 0"
  count="$(count_marker "$zshrc")"
  assert_eq "$count" "1" ".zshrc still has exactly one marker after second run"

  # Sub-case: corrupted checksum.
  local home2
  home2="$(mktemp -d)"
  local dir="$FIXTURE_ROOT/latest/download"
  local real_asset
  real_asset="$asset"
  # Write a wrong hash into checksums.txt.
  printf '%s  %s\n' "deadbeef00000000000000000000000000000000000000000000000000000000" "$real_asset" >"$dir/checksums.txt"

  rc=0
  run_install "$home2" "/bin/zsh" "" install >/dev/null 2>&1 || rc=$?
  if [[ "$rc" -ne 0 ]]; then pass "corrupt-checksum run exits non-zero"
  else fail "corrupt-checksum run unexpectedly exited 0"
  fi
  if [[ ! -e "$home2/.local/bin/clooks" ]]; then pass "no binary left behind after corrupt-checksum failure"
  else fail "binary was written despite checksum mismatch"
  fi

  # Restore a good checksums.txt for subsequent tests.
  (cd "$dir" && sha256_of "$real_asset" >checksums.txt)
}

# ---- Fixture 2: macOS-bash conditional .bashrc rule -------------------------

test_macos_bash_rule() {
  banner "fixture 2: macOS-bash conditional .bashrc rule"

  # Build fixture as if host OS were Darwin; our uname -s shim will confirm
  # this to install.sh even when the harness runs on Linux.
  local asset
  asset="$(setup_fixture_files darwin)"

  local shim_dir
  shim_dir="$(make_uname_shim)"

  # --- Sub-case 2a: .bashrc ABSENT at start ---
  local home_a
  home_a="$(mktemp -d)"
  local rc=0
  run_install "$home_a" "/bin/bash" "$shim_dir" install >/dev/null 2>&1 || rc=$?
  assert_eq "$rc" "0" "2a first run exits 0"

  local bp_a="$home_a/.bash_profile"
  local br_a="$home_a/.bashrc"
  assert_eq "$(count_marker "$bp_a")" "1" "2a .bash_profile has exactly one marker"
  if [[ ! -e "$br_a" ]]; then pass "2a .bashrc NOT created (rule honored)"
  else fail "2a .bashrc was created when it should not have been"
  fi

  # Second run — still no .bashrc, still one marker in .bash_profile.
  run_install "$home_a" "/bin/bash" "$shim_dir" install >/dev/null 2>&1 || rc=$?
  assert_eq "$rc" "0" "2a second run exits 0"
  assert_eq "$(count_marker "$bp_a")" "1" "2a .bash_profile still has one marker after rerun"
  if [[ ! -e "$br_a" ]]; then pass "2a .bashrc STILL not created after rerun"
  else fail "2a .bashrc appeared on rerun"
  fi

  # --- Sub-case 2b: .bashrc pre-exists with unrelated content ---
  local home_b
  home_b="$(mktemp -d)"
  printf '# pre-existing content\n' >"$home_b/.bashrc"

  rc=0
  run_install "$home_b" "/bin/bash" "$shim_dir" install >/dev/null 2>&1 || rc=$?
  assert_eq "$rc" "0" "2b first run exits 0"

  local bp_b="$home_b/.bash_profile"
  local br_b="$home_b/.bashrc"
  assert_eq "$(count_marker "$bp_b")" "1" "2b .bash_profile has exactly one marker"
  assert_eq "$(count_marker "$br_b")" "1" "2b .bashrc has exactly one marker"

  if grep -Fq "# pre-existing content" "$br_b"; then pass "2b original .bashrc content preserved"
  else fail "2b original .bashrc content was lost"
  fi

  # Second run — still exactly one marker each, original content intact.
  run_install "$home_b" "/bin/bash" "$shim_dir" install >/dev/null 2>&1 || rc=$?
  assert_eq "$rc" "0" "2b second run exits 0"
  assert_eq "$(count_marker "$bp_b")" "1" "2b .bash_profile still has one marker after rerun"
  assert_eq "$(count_marker "$br_b")" "1" "2b .bashrc still has one marker after rerun"
  if grep -Fq "# pre-existing content" "$br_b"; then pass "2b original content still present after rerun"
  else fail "2b original content disappeared after rerun"
  fi

  rm -rf "$shim_dir"
}

# ---- Fixture 3: Linux-bash rule ---------------------------------------------

# Only meaningful when the real host `uname -s` is Linux — no uname shim,
# real OS detection. Verifies .bashrc is the one-and-only target.
test_linux_bash_rule() {
  banner "fixture 3: Linux-bash rule"

  if [[ "$(uname -s)" != "Linux" ]]; then
    printf '  skip: not linux (host is %s)\n' "$(uname -s)"
    return 0
  fi

  local asset
  asset="$(setup_fixture_files linux)"
  : "$asset"  # asset is unused directly; setup populates the fixture tree.

  local home_dir
  home_dir="$(mktemp -d)"

  # Run 1.
  local rc=0
  run_install "$home_dir" "/bin/bash" "" install >/dev/null 2>&1 || rc=$?
  assert_eq "$rc" "0" "3 first run exits 0"

  local bashrc="$home_dir/.bashrc"
  local bp="$home_dir/.bash_profile"
  local zshrc="$home_dir/.zshrc"

  assert_eq "$(count_marker "$bashrc")" "1" "3 .bashrc has exactly one marker"
  if [[ ! -e "$bp" ]]; then pass "3 .bash_profile NOT created (Linux rule)"
  else fail "3 .bash_profile was created on Linux"
  fi
  if [[ ! -e "$zshrc" ]]; then pass "3 .zshrc NOT created"
  else fail "3 .zshrc was created on Linux bash"
  fi

  # Run 2 — idempotence.
  run_install "$home_dir" "/bin/bash" "" install >/dev/null 2>&1 || rc=$?
  assert_eq "$rc" "0" "3 second run exits 0"
  assert_eq "$(count_marker "$bashrc")" "1" "3 .bashrc still has one marker after rerun"
  if [[ ! -e "$bp" ]]; then pass "3 .bash_profile STILL not present after rerun"
  else fail "3 .bash_profile appeared on rerun"
  fi
}

# ---- Fixture 4: download / checksum failure modes ---------------------------

test_download_failure_modes() {
  banner "fixture 4: download / checksum failure modes"

  local asset
  # Use the host OS for fixture naming so install.sh's real uname path hits.
  if [[ "$(uname -s)" == "Darwin" ]]; then
    asset="$(setup_fixture_files darwin)"
  else
    asset="$(setup_fixture_files linux)"
  fi
  local dir="$FIXTURE_ROOT/latest/download"

  # --- 4a: binary 404 (delete the asset file) ---
  rm -f "$dir/$asset"

  local home_a
  home_a="$(mktemp -d)"
  local rc=0
  run_install "$home_a" "/bin/zsh" "" install >/dev/null 2>&1 || rc=$?
  if [[ "$rc" -ne 0 ]]; then pass "4a binary 404 exits non-zero"
  else fail "4a binary 404 unexpectedly exited 0"
  fi
  if [[ ! -e "$home_a/.local/bin/clooks" ]]; then pass "4a no binary installed after 404"
  else fail "4a binary was installed despite 404"
  fi

  # Restore fixture for next sub-case.
  setup_fixture_files "$(if [[ "$(uname -s)" == "Darwin" ]]; then printf darwin; else printf linux; fi)" >/dev/null

  # --- 4b: empty checksums.txt ---
  : >"$dir/checksums.txt"

  local home_b
  home_b="$(mktemp -d)"
  rc=0
  run_install "$home_b" "/bin/zsh" "" install >/dev/null 2>&1 || rc=$?
  if [[ "$rc" -ne 0 ]]; then pass "4b empty checksums.txt exits non-zero"
  else fail "4b empty checksums.txt unexpectedly exited 0"
  fi
  if [[ ! -e "$home_b/.local/bin/clooks" ]]; then pass "4b no binary installed after empty checksums"
  else fail "4b binary was installed despite empty checksums"
  fi

  # --- 4c: checksums.txt does not mention the target asset ---
  setup_fixture_files "$(if [[ "$(uname -s)" == "Darwin" ]]; then printf darwin; else printf linux; fi)" >/dev/null
  printf '%s  some-other-asset-name\n' "deadbeef00000000000000000000000000000000000000000000000000000000" >"$dir/checksums.txt"

  local home_c
  home_c="$(mktemp -d)"
  rc=0
  run_install "$home_c" "/bin/zsh" "" install >/dev/null 2>&1 || rc=$?
  if [[ "$rc" -ne 0 ]]; then pass "4c missing-asset checksum line exits non-zero"
  else fail "4c missing-asset checksum line unexpectedly exited 0"
  fi
  if [[ ! -e "$home_c/.local/bin/clooks" ]]; then pass "4c no binary installed after missing checksum entry"
  else fail "4c binary was installed despite missing checksum entry"
  fi

  # Restore a good fixture so later tests (if added) see a clean server.
  setup_fixture_files "$(if [[ "$(uname -s)" == "Darwin" ]]; then printf darwin; else printf linux; fi)" >/dev/null
}

# ---- Fixture 5: unsupported OS / arch ---------------------------------------

test_unsupported_platform() {
  banner "fixture 5: unsupported OS / arch"

  # No HTTP fetch needed — install.sh should fail at detect_os / detect_arch.

  # --- 5a: unsupported OS (Windows_NT) ---
  local shim_os
  shim_os="$(make_uname_shim_custom "Windows_NT" "")"

  local home_a
  home_a="$(mktemp -d)"
  local rc=0
  run_install "$home_a" "/bin/bash" "$shim_os" install >/dev/null 2>&1 || rc=$?
  if [[ "$rc" -ne 0 ]]; then pass "5a unsupported OS exits non-zero"
  else fail "5a unsupported OS unexpectedly exited 0"
  fi
  if [[ ! -e "$home_a/.local/bin/clooks" ]]; then pass "5a no binary installed for unsupported OS"
  else fail "5a binary was installed despite unsupported OS"
  fi
  rm -rf "$shim_os"

  # --- 5b: unsupported arch (mips) ---
  local shim_arch
  shim_arch="$(make_uname_shim_custom "" "mips")"

  local home_b
  home_b="$(mktemp -d)"
  rc=0
  run_install "$home_b" "/bin/bash" "$shim_arch" install >/dev/null 2>&1 || rc=$?
  if [[ "$rc" -ne 0 ]]; then pass "5b unsupported arch exits non-zero"
  else fail "5b unsupported arch unexpectedly exited 0"
  fi
  if [[ ! -e "$home_b/.local/bin/clooks" ]]; then pass "5b no binary installed for unsupported arch"
  else fail "5b binary was installed despite unsupported arch"
  fi
  rm -rf "$shim_arch"
}

# ---- Main -------------------------------------------------------------------

printf 'install.sh test harness\n'
printf 'MARKER literal: %s\n' "$MARKER"

start_fixture_server

test_zsh_happy_path
test_macos_bash_rule
test_linux_bash_rule
test_download_failure_modes
test_unsupported_platform

printf '\nsummary: %d passed, %d failed\n' "$PASSED" "$FAILED"

if [[ "$FAILED" -ne 0 ]]; then
  exit 1
fi
exit 0
