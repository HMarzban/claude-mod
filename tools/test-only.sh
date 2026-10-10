#!/usr/bin/env bash
# Runs only the tests whose names match the globs given, against a scratch
# copy of the plugin: the red and green steps of a task. Every commit still
# runs the whole suite. Usage: tools/test-only.sh golden-hash 'view-ledger'
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN="$ROOT/plugins/session-usage-band"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
# Everything but the tests, hidden folders (the manifest, the types) included.
find "$PLUGIN" -mindepth 1 -maxdepth 1 ! -name tests -exec cp -R {} "$SCRATCH/" \;
mkdir -p "$SCRATCH/tests"
# The shared test modules every test file may import.
for shared in helpers.ts matrix.ts globals.d.ts; do
  if [ -f "$PLUGIN/tests/$shared" ]; then cp "$PLUGIN/tests/$shared" "$SCRATCH/tests/"; fi
done
if [ -d "$PLUGIN/tests/golden" ]; then cp -R "$PLUGIN/tests/golden" "$SCRATCH/tests/"; fi
shopt -s nullglob
picked=0
for glob in "$@"; do
  for f in "$PLUGIN"/tests/$glob.test.ts; do cp "$f" "$SCRATCH/tests/"; picked=$((picked + 1)); done
done
if [ "$picked" -eq 0 ]; then echo "no test matches: $*" >&2; exit 1; fi
claude plugin test "$SCRATCH"
