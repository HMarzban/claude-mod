#!/usr/bin/env bash
# Runs only the tests whose names match the globs given, against a scratch
# copy of the plugin: the red and green steps of a task. Every commit still
# runs the whole suite. Usage: tools/test-only.sh golden-hash 'view-*'
set -euo pipefail
if [ "$#" -eq 0 ]; then echo "no test globs given" >&2; exit 1; fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN="$ROOT/plugins/session-usage-band"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
# Everything but the tests, hidden folders (the manifest, the types) included.
find "$PLUGIN" -mindepth 1 -maxdepth 1 ! -name tests -exec cp -R {} "$SCRATCH/" \;
mkdir -p "$SCRATCH/tests"
# Every shared module beside the test files, so a new one is never left out.
find "$PLUGIN/tests" -maxdepth 1 -type f ! -name '*.test.ts' -exec cp {} "$SCRATCH/tests/" \;
cp -R "$PLUGIN/tests/golden" "$SCRATCH/tests/"
# Every glob must match at least one file, so a typo fails instead of
# quietly running fewer tests.
for glob in "$@"; do
  matched=0
  for f in "$PLUGIN"/tests/$glob.test.ts; do
    [ -e "$f" ] || continue
    cp "$f" "$SCRATCH/tests/"
    matched=$((matched + 1))
  done
  if [ "$matched" -eq 0 ]; then echo "no test matches: $glob" >&2; exit 1; fi
done
claude plugin test "$SCRATCH"
