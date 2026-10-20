#!/usr/bin/env bash
# The views gate: outside chips, no view formats, parses a time, or reads a
# raw fact. Prints each offending line and fails if there is one.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if grep -nE '\.raw\b|\.reading\.|Date\.parse|\.replace\(|Math\.round|from '\''\.\./format'\''' "$ROOT"/plugins/nextcost/hooks/views/*.tsx | grep -vE '/chips\.tsx:'; then
  echo "views-gate: a view formats or reads a raw fact (see above)" >&2
  exit 1
fi
# Pulse and departures draw their own look: nothing from chips' cards or
# pills, no battery, no meter. Only the files that exist are read, since grep
# exits 2, not 0, on a missing one even where it matches.
LOOK=()
for f in departures departures-board pulse pulse-open; do
  if [ -e "$ROOT/plugins/nextcost/hooks/views/$f.tsx" ]; then LOOK+=("$ROOT/plugins/nextcost/hooks/views/$f.tsx"); fi
done
if [ "${#LOOK[@]}" -gt 0 ] && grep -nE "from '\./(cards|chips)'|[pP]ill\(|[bB]attery|meter\(" "${LOOK[@]}"; then
  echo "views-gate: pulse and departures draw their own look (see above)" >&2
  exit 1
fi
# Every Svg is built by the kit's `svg`, so its size, air and stretch are
# written once: no other hook writes an <svg> root.
if grep -rn '<svg xmlns' "$ROOT"/plugins/nextcost/hooks | grep -v '/hooks/kit\.tsx:'; then
  echo "views-gate: build an Svg with kit.svg (see above)" >&2
  exit 1
fi
