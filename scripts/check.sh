#!/usr/bin/env bash
# Checks the GitBook content folder:
#   1. every local link in SUMMARY.md points to an existing file;
#   2. every .md file except SUMMARY.md is linked from SUMMARY.md;
#   3. markdown-link-check passes on every .md file (HTTP 429 counts as alive,
#      localhost links are skipped).
# Runs from any directory. Set GITBOOK_DIR to check another folder (e.g. a temp copy).
# Exit code: 0 when every check passes, 1 otherwise.
set -euo pipefail

readonly LINK_CHECK_PKG="markdown-link-check@3.15.0"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GITBOOK_DIR="$(cd "${GITBOOK_DIR:-$SCRIPT_DIR/..}" && pwd)"
readonly SCRIPT_DIR GITBOOK_DIR
readonly SUMMARY_FILE="$GITBOOK_DIR/SUMMARY.md"

CONFIG_FILE=""
cleanup() {
  if [ -n "$CONFIG_FILE" ]; then
    rm -f "$CONFIG_FILE"
  fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

# Prints every .md file under GITBOOK_DIR, one absolute path per line, sorted.
list_markdown_files() {
  find "$GITBOOK_DIR" -type f -name '*.md' -not -path '*/node_modules/*' | LC_ALL=C sort
}

# Prints every local link target in SUMMARY.md (no URL scheme, no #anchor, no leading ./).
summary_targets() {
  grep -oE '\]\([^)]+\)' "$SUMMARY_FILE" \
    | sed -E 's/^\]\(//; s/\)$//; s/[[:space:]]+"[^"]*"$//; s/#.*$//; s#^\./##' \
    | grep -vE '^[A-Za-z][A-Za-z0-9+.-]*:' \
    | grep -v '^$' || true
}

# Fails when SUMMARY.md links a missing file or any page is missing from SUMMARY.md.
check_summary() {
  local targets target file rel problems=0

  if [ ! -f "$SUMMARY_FILE" ]; then
    echo "FAIL: $SUMMARY_FILE does not exist" >&2
    return 1
  fi
  targets="$(summary_targets)"

  while IFS= read -r target; do
    if [ -n "$target" ] && [ ! -f "$GITBOOK_DIR/$target" ]; then
      echo "FAIL: SUMMARY.md links to a missing file: $target" >&2
      problems=$((problems + 1))
    fi
  done <<EOF
$targets
EOF

  while IFS= read -r file; do
    rel="${file#"$GITBOOK_DIR"/}"
    if [ "$rel" = "SUMMARY.md" ]; then
      continue
    fi
    if ! printf '%s\n' "$targets" | grep -qxF -- "$rel"; then
      echo "FAIL: page not linked from SUMMARY.md: $rel" >&2
      problems=$((problems + 1))
    fi
  done < <(list_markdown_files)

  if [ "$problems" -gt 0 ]; then
    echo "SUMMARY check: $problems problem(s)" >&2
    return 1
  fi
  echo "SUMMARY check: OK (every page listed, every entry exists)"
}

# Writes the markdown-link-check config to a temp file removed on exit.
write_link_check_config() {
  CONFIG_FILE="$(mktemp "${TMPDIR:-/tmp}/gitbook-link-check.XXXXXX")" || return 1
  cat >"$CONFIG_FILE" <<'JSON'
{
  "ignorePatterns": [
    { "pattern": "^https?://localhost([:/?#]|$)" },
    { "pattern": "^https?://127\\.0\\.0\\.1([:/?#]|$)" }
  ],
  "aliveStatusCodes": [200, 206, 429],
  "timeout": "20s"
}
JSON
}

# Runs markdown-link-check on every .md file in one npx call.
check_links() {
  local files=() file
  while IFS= read -r file; do
    files+=("$file")
  done < <(list_markdown_files)

  if [ "${#files[@]}" -eq 0 ]; then
    echo "FAIL: no .md files under $GITBOOK_DIR" >&2
    return 1
  fi
  write_link_check_config || return 1
  echo "Link check: ${#files[@]} file(s) with $LINK_CHECK_PKG"
  if ! npx --yes "$LINK_CHECK_PKG" -q -c "$CONFIG_FILE" "${files[@]}"; then
    echo "Link check: FAILED" >&2
    return 1
  fi
  echo "Link check: OK"
}

main() {
  local status=0
  echo "Checking GitBook folder: $GITBOOK_DIR"
  check_summary || status=1
  check_links || status=1
  if [ "$status" -ne 0 ]; then
    echo "gitbook check: FAILED" >&2
    return 1
  fi
  echo "gitbook check: OK"
}

main "$@"
